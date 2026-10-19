// Node-only. Render every SOP Markdown source in data/sops to data/pdf/<id>.pdf.
// Output is deterministic, so rebuilding unchanged sources rewrites byte-identical PDFs and the
// SHA-256 version hashes (and the approvals bound to them) stay valid.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "../core/hash";
import { renderSopPdf } from "./render";

const DATA = join(import.meta.dirname, "..", "..", "data");

export async function buildPdfs(srcDir = join(DATA, "sops"), outDir = join(DATA, "pdf")): Promise<{ id: string; bytes: number; hash: string }[]> {
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".md")).sort();
  if (existsSync(outDir)) {
    // Drop PDFs whose Markdown source no longer exists.
    const keep = new Set(files.map((f) => f.replace(/\.md$/, ".pdf")));
    for (const f of readdirSync(outDir)) if (f.endsWith(".pdf") && !keep.has(f)) rmSync(join(outDir, f));
  }
  mkdirSync(outDir, { recursive: true });
  const out: { id: string; bytes: number; hash: string }[] = [];
  for (const f of files) {
    const pdf = await renderSopPdf(readFileSync(join(srcDir, f), "utf8"));
    const target = join(outDir, f.replace(/\.md$/, ".pdf"));
    const same = existsSync(target) && sha256Bytes(readFileSync(target)) === sha256Bytes(pdf);
    if (!same) writeFileSync(target, pdf);
    out.push({ id: f.replace(/\.md$/, ""), bytes: pdf.length, hash: sha256Bytes(pdf) });
  }
  return out;
}
