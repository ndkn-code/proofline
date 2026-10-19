// Ask one question from the command line: npm run ask -- "How do I void a supplier payment?"
import { createAnswerer } from "../src/core/answer";
import { loadAndIngest } from "../src/core/load";
import { formatLocator } from "../src/core/sop-pdf";

const q = process.argv.slice(2).join(" ").trim();
if (!q) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(1);
}
const { index } = await loadAndIngest();
const res = createAnswerer(index).ask(q);
if (res.kind === "answer") {
  for (const s of res.steps) {
    const c = res.citations[s.citation - 1]!;
    console.log(`${s.kind === "step" ? `${s.n}.` : "-"} ${s.text}  [${formatLocator(c.locator)}]`);
  }
} else {
  console.log(`${res.refusal!.message} (${res.refusal!.reason})`);
  console.log(res.refusal!.explanation);
  console.log(`Escalate to: ${res.refusal!.escalateTo}`);
}
console.log(`\nCandidates: ${res.candidates.map((c) => `${c.docId}=${c.score}/${c.coverage}`).join(", ") || "none"}`);
console.log(`Excluded: ${res.excluded.map((c) => `${c.docId} (${c.excludedBecause})`).join(", ") || "none"}`);
