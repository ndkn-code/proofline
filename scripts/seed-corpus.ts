// Writes the synthetic corpus to data/. Deterministic: running it twice produces identical files.
// Usage: npm run seed
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../src/core/hash";
import type { Approval } from "../src/core/types";
import { ARTICLES, DICTIONARY, SEEDED_DEFECTS, SEEDED_GATE_CASES, TICKETS, ownerFor, type ArticleSpec } from "./corpus-spec";

const ROOT = join(import.meta.dirname, "..", "data");

function bodyLines(spec: ArticleSpec, which: "article" | "source"): string[] {
  const base = spec.copyOf ? ARTICLES.find((a) => a.id === spec.copyOf) : undefined;
  const src = base ?? spec;
  const steps = which === "article" && spec.articleSteps ? spec.articleSteps : src.steps;
  const notes = which === "article" && spec.articleNotes ? spec.articleNotes : src.notes;
  const out: string[] = [];
  out.push("## Purpose", "", spec.purpose, "");
  if (src.before?.length) {
    out.push("## Before you start", "");
    for (const b of src.before) out.push(`- ${b}`);
    out.push("");
  }
  out.push("## Steps", "");
  steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
  out.push("");
  if (notes?.length) {
    out.push("## Notes", "");
    for (const n of notes) out.push(n.startsWith("<!--") ? n : `- ${n}`);
    out.push("");
  }
  return out;
}

function articleMarkdown(spec: ArticleSpec): string {
  const release = spec.release ?? "26.1";
  const sourceId = spec.sourceId === undefined ? `SRC-${spec.copyOf ?? spec.id}`.replace("SRC-JA-", "SRC-") : spec.sourceId;
  const fm = [
    "---",
    `id: ${spec.id}`,
    `title: ${spec.title}`,
    `module: ${spec.module}`,
    `erp_release: ${release}`,
    `owner_role: ${ownerFor(spec.module)}`,
    `reviewed_on: ${spec.reviewed}`,
    `review_due: ${spec.due}`,
    `status: ${spec.status ?? "published"}`,
  ];
  if (sourceId) fm.push(`source_id: ${sourceId}`);
  if (spec.dictionaryRefs?.length) fm.push(`dictionary_refs: [${spec.dictionaryRefs.join(", ")}]`);
  fm.push("---", "", `# ${spec.title}`, "");
  return [...fm, ...bodyLines(spec, "article")].join("\n");
}

function sourceMarkdown(spec: ArticleSpec): string {
  const release = spec.release ?? "26.1";
  const id = `SRC-${spec.id.replace("JA-", "")}`;
  return [
    "---",
    `id: ${id}`,
    `kind: procedure_capture`,
    `erp_release: ${release}`,
    `captured_by: Finance Systems (synthetic)`,
    `captured_on: ${spec.reviewed}`,
    "---",
    "",
    `# Procedure capture: ${spec.title}`,
    "",
    ...bodyLines(spec, "source"),
  ].join("\n");
}

for (const dir of ["articles", "sources", "dictionary", "tickets"]) {
  rmSync(join(ROOT, dir), { recursive: true, force: true });
  mkdirSync(join(ROOT, dir), { recursive: true });
}

const approvals: Approval[] = [];
for (const spec of ARTICLES) {
  let md = articleMarkdown(spec);
  if ((spec.status ?? "published") === "published") {
    approvals.push({
      article_id: spec.id,
      draft_hash: sha256(md),
      reviewer_role: ownerFor(spec.module),
      approved_on: spec.reviewed,
    });
  }
  if (spec.editAfterApproval) md = md.replace(spec.editAfterApproval.find, spec.editAfterApproval.replace);
  writeFileSync(join(ROOT, "articles", `${spec.id}.md`), md);
  // Duplicates and ticket-sourced articles have no source capture of their own.
  if (!spec.copyOf && spec.sourceId === undefined) {
    writeFileSync(join(ROOT, "sources", `SRC-${spec.id.replace("JA-", "")}.md`), sourceMarkdown(spec));
  }
}

for (const d of DICTIONARY) {
  const entry = { id: d.id, term: d.term, module: d.module, erp_release: d.release, definition: d.definition, ...(d.values ? { values: d.values } : {}) };
  writeFileSync(join(ROOT, "dictionary", `${d.id}.json`), JSON.stringify(entry, null, 2) + "\n");
}

const tickets = TICKETS.map(([id, module, opened_on, subject, description, resolution]) => ({ id, module, opened_on, subject, description, resolution }));
writeFileSync(join(ROOT, "tickets", "tickets.json"), JSON.stringify(tickets, null, 2) + "\n");
writeFileSync(join(ROOT, "reviews.json"), JSON.stringify({ approvals }, null, 2) + "\n");
writeFileSync(
  join(ROOT, "seeded-defects.json"),
  JSON.stringify({ note: "Ground truth for validator evaluation. Synthetic.", defects: SEEDED_DEFECTS, gate: SEEDED_GATE_CASES }, null, 2) + "\n",
);

console.log(`Seeded ${ARTICLES.length} articles, ${DICTIONARY.length} dictionary entries, ${tickets.length} tickets, ${approvals.length} approvals.`);
