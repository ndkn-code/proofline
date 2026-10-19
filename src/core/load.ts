// Node-only loader: reads data/, ingests it, and maintains the append-only content-addressed version store.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CURRENT_RELEASE, DEFAULT_AS_OF, RELEASES } from "./config";
import { hashRecord, sha256 } from "./hash";
import { ingest, type IngestOutput, type RawFile } from "./ingest";
import type { Approval } from "./types";

export const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
export const DATA = join(PROJECT_ROOT, "data");

function readDir(dir: string, ext: string): RawFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => ({ path: relative(PROJECT_ROOT, join(dir, f)), raw: readFileSync(join(dir, f), "utf8") }));
}

export function asOf(): string {
  return process.env.PROOFLINE_AS_OF ?? DEFAULT_AS_OF;
}

export function loadAndIngest(): IngestOutput {
  const approvals = (JSON.parse(readFileSync(join(DATA, "reviews.json"), "utf8")) as { approvals: Approval[] }).approvals;
  const ticketsPath = join(DATA, "tickets", "tickets.json");
  return ingest(
    {
      articles: readDir(join(DATA, "articles"), ".md"),
      sources: readDir(join(DATA, "sources"), ".md"),
      dictionary: readDir(join(DATA, "dictionary"), ".json"),
      tickets: { path: relative(PROJECT_ROOT, ticketsPath), raw: readFileSync(ticketsPath, "utf8") },
      approvals,
      asOf: asOf(),
      currentRelease: CURRENT_RELEASE,
      releases: RELEASES,
    },
    sha256,
    hashRecord,
  );
}

/**
 * Append-only version store. Each new content hash is written once to data/store/objects/<hash>
 * and logged in data/store/versions.jsonl. Existing objects are never rewritten.
 */
export function recordVersions(out: IngestOutput): { added: number; known: number } {
  const store = join(DATA, "store");
  const objects = join(store, "objects");
  mkdirSync(objects, { recursive: true });
  const log = join(store, "versions.jsonl");
  const seen = new Set<string>();
  if (existsSync(log)) {
    for (const line of readFileSync(log, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { id: string; hash: string };
      seen.add(`${rec.id}:${rec.hash}`);
    }
  }
  const content = new Map<string, string>();
  for (const a of out.articles) content.set(a.hash, a.raw);
  for (const s of out.sources) content.set(s.hash, s.raw);
  for (const d of out.index.dictionary) content.set(d.hash, readFileSync(join(PROJECT_ROOT, d.path), "utf8"));
  for (const t of out.index.tickets) {
    const { id, module, opened_on, subject, description, resolution } = t;
    content.set(t.hash, JSON.stringify({ id, module, opened_on, subject, description, resolution }));
  }
  let added = 0;
  const now = new Date().toISOString();
  for (const v of out.index.versions) {
    const key = `${v.id}:${v.hash}`;
    if (seen.has(key)) continue;
    const objPath = join(objects, v.hash);
    if (!existsSync(objPath)) writeFileSync(objPath, content.get(v.hash) ?? "", { flag: "wx" });
    appendFileSync(log, JSON.stringify({ ...v, first_seen: now }) + "\n");
    seen.add(key);
    added++;
  }
  return { added, known: out.index.versions.length - added };
}
