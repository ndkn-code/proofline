// Ingest the synthetic corpus: hash every version, run validators and the review gate, write the index.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, loadAndIngest, recordVersions } from "../src/core/load";

const out = await loadAndIngest();
const store = recordVersions(out);
mkdirSync(join(DATA, "build"), { recursive: true });
writeFileSync(join(DATA, "build", "index.json"), JSON.stringify(out.index, null, 2) + "\n");

const counts = out.index.sops.reduce<Record<string, number>>((acc, a) => {
  acc[a.status] = (acc[a.status] ?? 0) + 1;
  return acc;
}, {});
console.log(`Ingested ${out.index.sops.length} SOPs, ${out.sources.length} sources, ${out.index.dictionary.length} dictionary entries, ${out.index.tickets.length} tickets (as of ${out.index.as_of}).`);
console.log(`Status: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`Findings: ${out.index.findings.length}. Version store: ${store.added} new, ${store.known} already recorded.`);
console.log("Wrote data/build/index.json");
