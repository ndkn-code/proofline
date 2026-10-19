// Print validator findings and review-gate results. Exits 0; this is a report, not a CI gate.
import { loadAndIngest } from "../src/core/load";
import { formatLocator } from "../src/core/sop-pdf";

const { index } = await loadAndIngest();
const byCode = new Map<string, number>();
for (const f of index.findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
console.log(`Validator findings (as of ${index.as_of}):`);
for (const [code, n] of [...byCode.entries()].sort()) console.log(`  ${code.padEnd(28)} ${n}`);
console.log("");
for (const f of index.findings) {
  const loc = f.locator ? ` @ ${formatLocator(f.locator)} (${f.locator.section})` : "";
  console.log(`[${f.severity}] ${f.code} ${f.docId}${loc}: ${f.detail}`);
}
console.log("");
for (const a of index.sops.filter((x) => x.status !== "published")) {
  console.log(`${a.id.padEnd(11)} ${a.status.padEnd(6)} ${a.gate.reasons.join(" | ")}`);
}
