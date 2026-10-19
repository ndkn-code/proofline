// Node-only loader: reads data/, extracts the SOP PDFs, ingests everything, and maintains the
// append-only content-addressed version store.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CURRENT_RELEASE, DEFAULT_AS_OF, RELEASES } from "./config";
import { hashRecord, sha256, sha256Bytes } from "./hash";
import { ingest, type IngestOutput, type RawFile } from "./ingest";
import { parseSopPdf } from "./sop-pdf";
import { extractPdfPages } from "../pdf/extract";
import type { Approval, Sop } from "./types";

export const PROJECT_ROOT = join(import.meta.dirname, "..", "..");
export const DATA = join(PROJECT_ROOT, "data");
export const PDF_DIR = join(DATA, "pdf");

function readDir(dir: string, ext: string): RawFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => ({ path: relative(PROJECT_ROOT, join(dir, f)), raw: readFileSync(join(dir, f), "utf8") }));
}

export function asOf(): string {
  return process.env.PROOFLINE_AS_OF ?? DEFAULT_AS_OF;
}

/**
 * Read every SOP PDF in data/pdf: hash the exact bytes, extract the text with pdf.js, and parse the
 * document-control block, sections, steps and page/line locators from the extracted text alone.
 */
export async function loadSopPdfs(dir = PDF_DIR): Promise<{ sops: Sop[]; bytes: Map<string, Uint8Array> }> {
  if (!existsSync(dir)) throw new Error(`No SOP PDFs in ${relative(PROJECT_ROOT, dir)}. Run "npm run pdf" first.`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  if (files.length === 0) throw new Error(`No SOP PDFs in ${relative(PROJECT_ROOT, dir)}. Run "npm run pdf" first.`);
  const bytes = new Map<string, Uint8Array>();
  const sops: Sop[] = [];
  for (const f of files) {
    const buf = new Uint8Array(readFileSync(join(dir, f)));
    const hash = sha256Bytes(buf);
    const pages = await extractPdfPages(buf);
    sops.push(parseSopPdf(relative(PROJECT_ROOT, join(dir, f)), pages, hash));
    bytes.set(hash, buf);
  }
  return { sops, bytes };
}

export interface LoadOutput extends IngestOutput {
  /** PDF bytes by SHA-256, for the version store. */
  pdfBytes: Map<string, Uint8Array>;
}

export async function loadAndIngest(): Promise<LoadOutput> {
  const approvals = (JSON.parse(readFileSync(join(DATA, "reviews.json"), "utf8")) as { approvals: Approval[] }).approvals;
  const ticketsPath = join(DATA, "tickets", "tickets.json");
  const { sops, bytes } = await loadSopPdfs();
  const out = ingest(
    {
      sops,
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
  return { ...out, pdfBytes: bytes };
}

/**
 * Append-only version store. Each new content hash is written once to data/store/objects/<hash>
 * and logged in data/store/versions.jsonl. Existing objects are never rewritten.
 */
export function recordVersions(out: LoadOutput): { added: number; known: number } {
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
  const content = new Map<string, string | Uint8Array>();
  for (const [h, b] of out.pdfBytes) content.set(h, b);
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
