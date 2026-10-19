// Render the SOP Markdown sources (data/sops) to controlled PDFs (data/pdf). Usage: npm run pdf
import { buildPdfs } from "../src/pdf/build";

const built = await buildPdfs();
const total = built.reduce((s, b) => s + b.bytes, 0);
console.log(`Rendered ${built.length} SOP PDFs to data/pdf (${(total / 1024).toFixed(0)} KB total).`);
