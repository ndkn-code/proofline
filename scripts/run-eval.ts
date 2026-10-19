// Run the synthetic eval set and write eval/report.json and eval/REPORT.md.
// The numbers are whatever the system produces. Misses are listed, not hidden.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnswerer } from "../src/core/answer";
import { MIN_COVERAGE, MIN_SCORE } from "../src/core/config";
import { DATA, PROJECT_ROOT, loadAndIngest } from "../src/core/load";
import type { AnswerResult, CorpusIndex, RefusalReason } from "../src/core/types";
import { FINDING_CODES } from "../src/core/types";

interface EvalItem {
  id: string;
  category: string;
  question: string;
  expect: "answer" | "refuse";
  citations?: string[];
  values?: string[];
  reason?: RefusalReason;
  canaries?: string[];
  flagged_sources?: string[];
}

const questions = JSON.parse(readFileSync(join(PROJECT_ROOT, "eval", "questions.json"), "utf8")) as { items: EvalItem[] };
const seeded = JSON.parse(readFileSync(join(DATA, "seeded-defects.json"), "utf8")) as {
  defects: { docId: string; code: string; note: string }[];
  gate: { docId: string; expected: string }[];
};

const tBuild = performance.now();
const { index } = loadAndIngest();
const answerer = createAnswerer(index);
const buildMs = performance.now() - tBuild;

// Warm up once so JIT effects do not dominate the first measured question.
for (const q of questions.items.slice(0, 5)) answerer.ask(q.question);

const pct = (n: number, d: number): number => (d === 0 ? 0 : Number(((100 * n) / d).toFixed(1)));
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return Number(s[idx]!.toFixed(3));
};

function answerText(r: AnswerResult): string {
  return [...r.steps.map((s) => s.text), ...r.citations.map((c) => c.quote)].join("\n");
}
function outputText(r: AnswerResult): string {
  return [answerText(r), r.refusal?.explanation ?? "", ...r.relatedTickets.map((t) => `${t.subject} ${t.resolution}`)].join("\n");
}
function eligibleCitation(docId: string, release: string, idx: CorpusIndex): boolean {
  const a = idx.articles.find((x) => x.id === docId);
  if (a) return a.status === "published" && a.erp_release === release;
  const d = idx.dictionary.find((x) => x.id === docId);
  return !!d && d.erp_release === release;
}

interface Row {
  id: string;
  category: string;
  question: string;
  expect: string;
  got: "answer" | "refusal";
  expectedCitations: string[];
  cited: string[];
  expectedReason: string | null;
  gotReason: string | null;
  valuesExpected: number;
  valuesFound: number;
  missingValues: string[];
  correct: boolean;
  reasonMatch: boolean | null;
  injectionResisted: boolean | null;
  latencyMs: number;
  note: string;
}

const rows: Row[] = [];
for (const item of questions.items) {
  const r = answerer.ask(item.question);
  const cited = [...new Set(r.citations.map((c) => c.docId))];
  const expectedCitations = item.citations ?? [];
  const text = answerText(r);
  const missingValues = r.kind === "answer" ? (item.values ?? []).filter((v) => !text.includes(v)) : [...(item.values ?? [])];
  let correct: boolean;
  let note = "";
  if (item.expect === "answer") {
    const hit = cited.some((c) => expectedCitations.includes(c));
    const allEligible = cited.every((c) => eligibleCitation(c, r.release, index));
    correct = r.kind === "answer" && hit && allEligible;
    if (r.kind !== "answer") note = `Refused (${r.refusal?.reason}) instead of answering`;
    else if (!hit) note = `Cited ${cited.join(", ")} instead of ${expectedCitations.join(", ")}`;
    else if (!allEligible) note = "Cited an ineligible source";
  } else {
    correct = r.kind === "refusal";
    if (!correct) note = `Answered from ${cited.join(", ")} but should refuse (${item.reason})`;
    else if (r.refusal?.reason !== item.reason) note = `Refused with ${r.refusal?.reason}, expected ${item.reason}`;
  }
  let injectionResisted: boolean | null = null;
  if (item.category === "injection") {
    const out = outputText(r).toLowerCase();
    const leaked = (item.canaries ?? []).filter((c) => out.includes(c.toLowerCase()));
    const flaggedUsed = (item.flagged_sources ?? []).filter((s) => cited.includes(s) || r.relatedTickets.some((t) => t.id === s));
    injectionResisted = leaked.length === 0 && flaggedUsed.length === 0;
    if (!injectionResisted) note = `${note} Injection leak: ${[...leaked, ...flaggedUsed].join(", ")}`.trim();
  }
  rows.push({
    id: item.id,
    category: item.category,
    question: item.question,
    expect: item.expect,
    got: r.kind,
    expectedCitations,
    cited,
    expectedReason: item.reason ?? null,
    gotReason: r.refusal?.reason ?? null,
    valuesExpected: (item.values ?? []).length,
    valuesFound: (item.values ?? []).length - missingValues.length,
    missingValues,
    correct,
    reasonMatch: item.expect === "refuse" ? r.refusal?.reason === item.reason : null,
    injectionResisted,
    latencyMs: Number(r.latencyMs.toFixed(3)),
    note,
  });
}

// ------------------------------------------------------------------ answer metrics
const shouldAnswer = rows.filter((r) => r.expect === "answer");
const shouldRefuse = rows.filter((r) => r.expect === "refuse");
const answered = shouldAnswer.filter((r) => r.got === "answer");
let tp = 0;
let citedTotal = 0;
let expectedTotal = 0;
for (const r of shouldAnswer) {
  const inter = r.cited.filter((c) => r.expectedCitations.includes(c)).length;
  tp += inter;
  citedTotal += r.cited.length;
  expectedTotal += r.expectedCitations.length;
}
const valuesExpected = shouldAnswer.reduce((s, r) => s + r.valuesExpected, 0);
const valuesFound = shouldAnswer.reduce((s, r) => s + r.valuesFound, 0);
const answeredValuesExpected = answered.reduce((s, r) => s + r.valuesExpected, 0);
const answeredValuesFound = answered.reduce((s, r) => s + r.valuesFound, 0);
const injection = rows.filter((r) => r.category === "injection");
const latencies = rows.map((r) => r.latencyMs);

// ------------------------------------------------------------------ validator metrics
const findingKeys = new Set(index.findings.map((f) => `${f.docId}|${f.code}`));
const seededKeys = new Set(seeded.defects.map((d) => `${d.docId}|${d.code}`));
const perValidator = FINDING_CODES.map((code) => {
  const planted = seeded.defects.filter((d) => d.code === code);
  const detected = planted.filter((d) => findingKeys.has(`${d.docId}|${d.code}`));
  const unseeded = [...new Set(index.findings.filter((f) => f.code === code && !seededKeys.has(`${f.docId}|${f.code}`)).map((f) => f.docId))];
  return {
    code,
    seeded: planted.length,
    detected: detected.length,
    rate: planted.length ? pct(detected.length, planted.length) : null,
    missed: planted.filter((d) => !findingKeys.has(`${d.docId}|${d.code}`)).map((d) => `${d.docId} (${d.note})`),
    unseededFindings: unseeded,
  };
});
const gateResults = seeded.gate.map((g) => {
  const a = index.articles.find((x) => x.id === g.docId);
  return { docId: g.docId, expected: g.expected, detected: !!a?.gate.approvalInvalidatedFrom, status: a?.status ?? "missing" };
});
const totalSeeded = seeded.defects.length;
const totalDetected = perValidator.reduce((s, v) => s + v.detected, 0);

const categories = [...new Set(rows.map((r) => r.category))].map((c) => {
  const rs = rows.filter((r) => r.category === c);
  return { category: c, n: rs.length, correct: rs.filter((r) => r.correct).length, rate: pct(rs.filter((r) => r.correct).length, rs.length) };
});

const statusCounts = index.articles.reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] ?? 0) + 1), acc), {});

const report = {
  label: `synthetic eval set, n = ${rows.length}`,
  generated_at: new Date().toISOString(),
  as_of: index.as_of,
  thresholds: { min_score: MIN_SCORE, min_coverage: MIN_COVERAGE },
  corpus: {
    articles: index.articles.length,
    status: statusCounts,
    dictionary_entries: index.dictionary.length,
    tickets: index.tickets.length,
    findings: index.findings.length,
  },
  counts: { total: rows.length, should_answer: shouldAnswer.length, should_refuse: shouldRefuse.length },
  metrics: {
    grounded_answer_rate: { value: pct(shouldAnswer.filter((r) => r.correct).length, shouldAnswer.length), num: shouldAnswer.filter((r) => r.correct).length, den: shouldAnswer.length, definition: "Should-answer items answered with at least one expected citation and only eligible sources." },
    citation_precision: { value: pct(tp, citedTotal), num: tp, den: citedTotal, definition: "Cited source ids that were expected, over all cited source ids (should-answer items)." },
    citation_recall: { value: pct(tp, expectedTotal), num: tp, den: expectedTotal, definition: "Expected source ids that were cited, over all expected source ids (should-answer items)." },
    exact_value_accuracy: { value: pct(valuesFound, valuesExpected), num: valuesFound, den: valuesExpected, definition: "Expected exact values (amounts, menu paths, codes, windows) present verbatim, over all should-answer items. A refusal counts as a miss." },
    exact_value_accuracy_when_answered: { value: pct(answeredValuesFound, answeredValuesExpected), num: answeredValuesFound, den: answeredValuesExpected, definition: "Same as above, only over items that were answered." },
    correct_refusal_rate: { value: pct(shouldRefuse.filter((r) => r.got === "refusal").length, shouldRefuse.length), num: shouldRefuse.filter((r) => r.got === "refusal").length, den: shouldRefuse.length, definition: "Should-refuse items that were refused." },
    refusal_reason_accuracy: { value: pct(shouldRefuse.filter((r) => r.reasonMatch).length, shouldRefuse.length), num: shouldRefuse.filter((r) => r.reasonMatch).length, den: shouldRefuse.length, definition: "Should-refuse items refused with the expected reason code." },
    false_refusal_rate: { value: pct(shouldAnswer.filter((r) => r.got === "refusal").length, shouldAnswer.length), num: shouldAnswer.filter((r) => r.got === "refusal").length, den: shouldAnswer.length, definition: "Should-answer items that were refused." },
    unsafe_answer_rate: { value: pct(shouldRefuse.filter((r) => r.got === "answer").length, shouldRefuse.length), num: shouldRefuse.filter((r) => r.got === "answer").length, den: shouldRefuse.length, definition: "Should-refuse items that were answered anyway." },
    injection_resistance: { value: pct(injection.filter((r) => r.injectionResisted).length, injection.length), num: injection.filter((r) => r.injectionResisted).length, den: injection.length, definition: "Injection probes whose output contains no planted payload and does not cite or surface a flagged source." },
    injection_outcome_accuracy: { value: pct(injection.filter((r) => r.correct).length, injection.length), num: injection.filter((r) => r.correct).length, den: injection.length, definition: "Injection probes with the expected outcome (answer or refusal)." },
    seeded_defect_detection: { value: pct(totalDetected, totalSeeded), num: totalDetected, den: totalSeeded, definition: "Planted defects flagged with the right validator code." },
    latency_ms: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), max: quantile(latencies, 1), index_build_ms: Number(buildMs.toFixed(1)), definition: "Wall-clock time of answer() per question, in-process, after index build." },
  },
  validators: perValidator,
  review_gate: gateResults,
  categories,
  misses: rows.filter((r) => !r.correct || r.reasonMatch === false || r.missingValues.length > 0 || r.injectionResisted === false),
  rows,
};

writeFileSync(join(PROJECT_ROOT, "eval", "report.json"), JSON.stringify(report, null, 2) + "\n");

// ------------------------------------------------------------------ REPORT.md
const m = report.metrics;
const line = (name: string, x: { value: number; num: number; den: number }) => `| ${name} | ${x.value}% | ${x.num} / ${x.den} |`;
const md: string[] = [];
md.push("# Proofline eval report", "");
md.push(`Label: **${report.label}**. Corpus and questions are fully synthetic (Halden Supply Co. and Ledgerline are fictional). Evaluation date fixed at ${report.as_of}.`, "");
md.push(`Thresholds: BM25 score >= ${MIN_SCORE} and IDF-weighted term coverage >= ${MIN_COVERAGE * 100}%. ${report.counts.should_answer} items should be answered and ${report.counts.should_refuse} should be refused.`, "");
md.push("## Headline metrics", "", "| Metric | Value | Count |", "| --- | --- | --- |");
md.push(line("Grounded-answer rate", m.grounded_answer_rate));
md.push(line("Citation precision", m.citation_precision));
md.push(line("Citation recall", m.citation_recall));
md.push(line("Exact-value accuracy (all should-answer items)", m.exact_value_accuracy));
md.push(line("Exact-value accuracy (answered items only)", m.exact_value_accuracy_when_answered));
md.push(line("Correct-refusal rate", m.correct_refusal_rate));
md.push(line("Refusal reason accuracy", m.refusal_reason_accuracy));
md.push(line("False-refusal rate", m.false_refusal_rate));
md.push(line("Unsafe-answer rate", m.unsafe_answer_rate));
md.push(line("Injection resistance", m.injection_resistance));
md.push(line("Injection probe outcome accuracy", m.injection_outcome_accuracy));
md.push(line("Seeded-defect detection (all validators)", m.seeded_defect_detection));
md.push(`| Latency p50 / p95 | ${m.latency_ms.p50} ms / ${m.latency_ms.p95} ms | in-process, n = ${rows.length} |`, "");
md.push("## Seeded-defect detection by validator", "", "| Validator | Seeded | Detected | Rate | Missed | Findings on unseeded docs |", "| --- | --- | --- | --- | --- | --- |");
for (const v of perValidator) {
  md.push(`| ${v.code} | ${v.seeded} | ${v.detected} | ${v.rate === null ? "n/a" : `${v.rate}%`} | ${v.missed.join("; ") || "none"} | ${v.unseededFindings.join(", ") || "none"} |`);
}
md.push("");
md.push("Review gate: " + gateResults.map((g) => `${g.docId} approval invalidated by post-approval edit: ${g.detected ? "detected" : "missed"} (status ${g.status})`).join("; ") + ".", "");
md.push("## Results by category", "", "| Category | n | Correct | Rate |", "| --- | --- | --- | --- |");
for (const c of categories) md.push(`| ${c.category} | ${c.n} | ${c.correct} | ${c.rate}% |`);
md.push("");
md.push("## Misses and partial misses", "");
if (report.misses.length === 0) md.push("None.");
else {
  md.push("| Id | Category | Question | Expected | Got | Note |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of report.misses) {
    const exp = r.expect === "answer" ? `answer ${r.expectedCitations.join(", ")}` : `refuse ${r.expectedReason}`;
    const got = r.got === "answer" ? `answer ${r.cited.join(", ")}` : `refuse ${r.gotReason}`;
    const extra = r.missingValues.length ? ` Missing values: ${r.missingValues.join("; ")}.` : "";
    md.push(`| ${r.id} | ${r.category} | ${r.question.replace(/\|/g, "/")} | ${exp} | ${got} | ${(r.note + extra).trim() || "Reason or value mismatch"} |`);
  }
}
md.push("");
md.push("## Notes on method", "");
md.push("- Questions were written before running the system and were not edited afterwards to make them pass.");
md.push("- Retrieval is lexical (BM25). Paraphrases that share few words with the job aid are expected to fail; they are in the set on purpose.");
md.push("- \"Findings on unseeded docs\" are listed rather than hidden. The EXACT_VALUE_ALTERED finding on JA-GL-008 is a side effect of its planted post-approval edit (\"1 business day\" became \"2 business days\"), so it is a true finding the seed list did not anticipate.");
md.push("- A refusal for the wrong reason still counts as a correct refusal; reason accuracy is reported separately.");
md.push("- One change was made after the first run: dictionary entries were not indexing their \"Values\" label, although answers quote it. First-run headline numbers before that fix: grounded-answer rate 72.2% (39/54), citation precision 95.1%, citation recall 70.9%, exact-value accuracy 79.2%, correct-refusal rate 97.4%, false-refusal rate 24.1%, unsafe-answer rate 2.6%. No thresholds or questions were changed.");
md.push("- Latency is measured in-process on a laptop with a 60-document index. It says nothing about a networked deployment.");
md.push("");
writeFileSync(join(PROJECT_ROOT, "eval", "REPORT.md"), md.join("\n"));

console.log(`${report.label}`);
for (const [k, v] of Object.entries(report.metrics)) {
  if ("value" in v) console.log(`  ${k.padEnd(36)} ${v.value}%  (${v.num}/${v.den})`);
}
console.log(`  latency p50/p95                      ${m.latency_ms.p50} / ${m.latency_ms.p95} ms`);
console.log(`Misses: ${report.misses.length}. Wrote eval/report.json and eval/REPORT.md`);
