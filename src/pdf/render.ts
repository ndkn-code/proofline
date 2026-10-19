// Node-only. Renders an SOP Markdown source into a real, deterministic PDF with pdfkit.
// Page 1 carries the title, the document-control block and the purpose; the procedure starts on page 2.
// Every PDF has a running header and footer (stripped again on extraction), long lines wrap,
// and HTML comments in the source become hidden 1pt white text, the way instructions get planted in real PDFs.
import PDFDocument from "pdfkit";
import { parseMarkdown } from "../core/markdown";
import {
  BLOCK_GAP,
  BULLET,
  CONTENT,
  CONTROL_FIELDS,
  CONTROL_SECTION,
  CONTROL_VALUE_X,
  DOC_TYPE_LABEL,
  FOOTER_Y,
  HEADER_Y,
  HEADING_GAP,
  LINE_HEIGHT,
  MARKER_INDENT,
  PAGE,
  SIZE,
} from "../core/pdf-layout";

type Block =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string; newPage?: boolean }
  | { kind: "control"; label: string; value: string }
  | { kind: "paragraph"; text: string }
  | { kind: "step"; marker: string; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "hidden"; text: string };

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";

function blocksFrom(markdown: string): { blocks: Block[]; front: Record<string, string | string[]> } {
  const { front } = parseMarkdown(markdown);
  const title = String(front.title ?? "Untitled");
  const blocks: Block[] = [{ kind: "title", text: title }, { kind: "heading", text: CONTROL_SECTION }];
  for (const f of CONTROL_FIELDS) {
    const v = front[f.key];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    const value = Array.isArray(v) ? v.join(", ") : f.key === "doc_type" ? (DOC_TYPE_LABEL[v] ?? v) : v;
    blocks.push({ kind: "control", label: `${f.label}:`, value });
  }

  const lines = markdown.split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== "---") i++;
    i++;
  }
  let seenProcedure = false;
  for (; i < lines.length; i++) {
    const t = (lines[i] ?? "").trim();
    if (!t || /^#\s+/.test(t)) continue;
    const h = /^##\s+(.*)$/.exec(t);
    if (h) {
      const text = (h[1] ?? "").trim();
      const newPage = !seenProcedure && text !== "Purpose";
      if (newPage) seenProcedure = true;
      blocks.push({ kind: "heading", text, newPage });
      continue;
    }
    const comment = /^<!--\s*([\s\S]*?)\s*-->$/.exec(t);
    if (comment) {
      blocks.push({ kind: "hidden", text: comment[1] ?? "" });
      continue;
    }
    const step = /^(\d+)\.\s+(.*)$/.exec(t);
    if (step) {
      blocks.push({ kind: "step", marker: `${step[1]}.`, text: step[2] ?? "" });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(t);
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[1] ?? "" });
      continue;
    }
    blocks.push({ kind: "paragraph", text: t });
  }
  return { blocks, front };
}

function wrap(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && doc.widthOfString(next) > width) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Render one SOP Markdown source to PDF bytes. Same input always gives the same bytes. */
export function renderSopPdf(markdown: string): Promise<Buffer> {
  const { blocks, front } = blocksFrom(markdown);
  const id = String(front.id ?? "UNKNOWN");
  const reviewed = String(front.reviewed_on ?? "2026-01-01");
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Title: String(front.title ?? id),
      Subject: `${id} (synthetic SOP)`,
      Author: "Halden Supply Co. Finance Systems (fictional)",
      Keywords: "synthetic, sop, proofline",
      // Fixed date so the bytes, and therefore the SHA-256 version hash, are reproducible.
      CreationDate: new Date(`${reviewed}T00:00:00Z`),
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  let y = 0;
  let firstOnPage = true;
  const newPage = () => {
    doc.addPage({ size: [PAGE.width, PAGE.height], margins: { top: 20, bottom: 20, left: 36, right: 36 } });
    y = CONTENT.top;
    firstOnPage = true;
  };
  const width = CONTENT.right - CONTENT.left;
  newPage();

  for (const b of blocks) {
    if (b.kind === "heading" && b.newPage) newPage();
    let lines: string[];
    let lh: number;
    let size: number;
    let font = REGULAR;
    let x = CONTENT.left;
    let gap = BLOCK_GAP;
    switch (b.kind) {
      case "title":
        size = SIZE.title;
        lh = LINE_HEIGHT.title;
        font = BOLD;
        doc.font(font).fontSize(size);
        lines = wrap(doc, b.text, width);
        break;
      case "heading":
        size = SIZE.heading;
        lh = LINE_HEIGHT.heading;
        font = BOLD;
        gap = HEADING_GAP;
        doc.font(font).fontSize(size);
        lines = wrap(doc, b.text, width);
        break;
      case "control":
        size = SIZE.body;
        lh = LINE_HEIGHT.body;
        doc.font(REGULAR).fontSize(size);
        lines = wrap(doc, b.value, CONTENT.right - CONTROL_VALUE_X);
        break;
      case "step":
      case "bullet":
        size = SIZE.body;
        lh = LINE_HEIGHT.body;
        x = CONTENT.left + MARKER_INDENT;
        doc.font(REGULAR).fontSize(size);
        lines = wrap(doc, b.text, width - MARKER_INDENT);
        break;
      case "hidden":
        size = SIZE.hidden;
        lh = 2;
        lines = [b.text];
        break;
      default:
        size = SIZE.body;
        lh = LINE_HEIGHT.body;
        doc.font(REGULAR).fontSize(size);
        lines = wrap(doc, b.text, width);
    }
    const height = lines.length * lh;
    const before = firstOnPage ? 0 : gap;
    if (!firstOnPage && y + before + height > CONTENT.bottom) newPage();
    else y += before;
    firstOnPage = false;

    if (b.kind === "control") doc.font(BOLD).fontSize(size).fillColor("#111111").text(b.label, CONTENT.left, y, { lineBreak: false });
    if (b.kind === "step") doc.font(REGULAR).fontSize(size).fillColor("#111111").text(b.marker, CONTENT.left, y, { lineBreak: false });
    if (b.kind === "bullet") doc.font(REGULAR).fontSize(size).fillColor("#111111").text(BULLET, CONTENT.left + 4, y, { lineBreak: false });
    const tx = b.kind === "control" ? CONTROL_VALUE_X : x;
    doc.font(font).fontSize(size).fillColor(b.kind === "hidden" ? "#FFFFFF" : "#111111");
    lines.forEach((ln, k) => doc.text(ln, tx, y + k * lh, { lineBreak: false }));
    y += height;
  }

  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.font(REGULAR).fontSize(SIZE.boilerplate).fillColor("#555555");
    doc.text("Halden Supply Co.  |  Finance Systems  |  Controlled document (fictional)", CONTENT.left, HEADER_Y, { lineBreak: false });
    doc.text(`${id}  |  Rev. ${reviewed}  |  Page ${p + 1} of ${range.count}  |  Synthetic, for demonstration only`, CONTENT.left, FOOTER_Y, { lineBreak: false });
  }
  doc.end();
  return done;
}
