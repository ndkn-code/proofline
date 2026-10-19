import { sha256 } from "../src/core/hash";
import { parseSopMarkdown, parseSource } from "../src/core/ingest";
import type { Sop, SourceDoc } from "../src/core/types";

export interface MkSop {
  id: string;
  module?: string;
  release?: string;
  due?: string;
  status?: "published" | "draft";
  sourceId?: string | null;
  dictionaryRefs?: string[];
  steps: string[];
  notes?: string[];
}

export function sopMd(o: MkSop): string {
  const fm = [
    "---",
    `id: ${o.id}`,
    "doc_type: sop",
    `title: Test SOP ${o.id}`,
    `module: ${o.module ?? "Accounts Payable"}`,
    `erp_release: ${o.release ?? "26.1"}`,
    "owner_role: AP Operations Supervisor",
    "reviewed_on: 2026-08-01",
    `review_due: ${o.due ?? "2027-02-01"}`,
    `status: ${o.status ?? "published"}`,
  ];
  if (o.sourceId !== null) fm.push(`source_id: ${o.sourceId ?? `SRC-${o.id}`}`);
  if (o.dictionaryRefs) fm.push(`dictionary_refs: [${o.dictionaryRefs.join(", ")}]`);
  fm.push("---", "", `# Test SOP ${o.id}`, "", "## Purpose", "", "Test purpose line.", "", "## Steps", "");
  o.steps.forEach((s, i) => fm.push(`${i + 1}. ${s}`));
  if (o.notes?.length) {
    fm.push("", "## Notes", "");
    for (const n of o.notes) fm.push(n.startsWith("<!--") ? n : `- ${n}`);
  }
  return fm.join("\n") + "\n";
}

export function mkSop(o: MkSop): Sop {
  return parseSopMarkdown({ path: `${o.id}.md`, raw: sopMd(o) }, sha256);
}

export function mkSource(id: string, steps: string[], notes: string[] = []): SourceDoc {
  const raw = ["---", `id: ${id}`, "---", "", "## Steps", "", ...steps.map((s, i) => `${i + 1}. ${s}`), "", "## Notes", "", ...notes.map((n) => `- ${n}`)].join("\n");
  return parseSource({ path: `${id}.md`, raw }, sha256);
}
