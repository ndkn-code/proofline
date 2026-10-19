// Node-only. Reads a PDF with pdf.js (via unpdf) and returns its visual text lines with position and size.
// No OCR and no knowledge of the source Markdown: only what is in the PDF content stream.
import { getDocumentProxy } from "unpdf";
import type { PdfPage, PdfTextLine } from "../core/sop-pdf";

interface Item {
  str: string;
  x: number;
  top: number;
  width: number;
  size: number;
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  // pdf.js may transfer the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: PdfPage[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || raw.str === "") continue;
      const [a, b, , , e, f] = raw.transform as number[];
      items.push({ str: raw.str, x: e ?? 0, top: height - (f ?? 0), width: raw.width, size: Math.round(Math.hypot(a ?? 0, b ?? 0) * 10) / 10 });
    }
    // Group items that share a baseline into one visual line, left to right.
    const rows = new Map<number, Item[]>();
    for (const it of items) {
      const key = Math.round(it.top * 10) / 10;
      const row = rows.get(key) ?? [];
      row.push(it);
      rows.set(key, row);
    }
    const lines: PdfTextLine[] = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([top, row]) => {
        row.sort((a, b) => a.x - b.x);
        let text = "";
        let end = -Infinity;
        for (const it of row) {
          if (text && it.x - end > 0.5 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
          text += it.str;
          end = it.x + it.width;
        }
        return { top, x: row[0]!.x, size: Math.max(...row.map((r) => r.size)), text: text.replace(/\s+/g, " ").trim() };
      })
      .filter((l) => l.text.length > 0);
    pages.push({ page: p, height, lines });
  }
  await pdf.cleanup();
  return pages;
}
