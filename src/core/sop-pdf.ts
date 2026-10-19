// Turn the visual text lines of an SOP PDF back into a structured SOP. Isomorphic: it only sees what a
// PDF text extractor returns (text, position, font size), never the Markdown the PDF was rendered from.
//
// Locators are page + visual line: lines are numbered 1..n from the top of each page, after the
// running header and footer are stripped. A sentence that wraps keeps its first line as the anchor
// and records the last line in lineEnd.
import {
  BOILERPLATE_BOTTOM,
  BOILERPLATE_TOP,
  BULLET,
  CONTROL_FIELDS,
  CONTROL_SECTION,
  DOC_TYPE_LABEL,
  HIDDEN_MAX_SIZE,
  LINE_HEIGHT,
  SIZE,
} from "./pdf-layout";
import type { DeclaredStatus, DocType, Module, Section, Sop, SopFrontMatter, SopLine } from "./types";
import { MODULES } from "./types";

export interface PdfTextLine {
  /** Baseline distance from the top of the page, in points. */
  top: number;
  x: number;
  size: number;
  text: string;
}

export interface PdfPage {
  page: number;
  height: number;
  lines: PdfTextLine[];
}

type Kind = "title" | "heading" | "body" | "hidden";

interface Block {
  kind: Kind;
  page: number;
  line: number;
  lineEnd: number;
  text: string;
}

function kindOf(size: number): Kind {
  if (size <= HIDDEN_MAX_SIZE) return "hidden";
  if (size >= SIZE.title - 0.5) return "title";
  if (size >= SIZE.heading - 0.5) return "heading";
  return "body";
}

const lineHeight = (k: Kind): number => (k === "title" ? LINE_HEIGHT.title : k === "heading" ? LINE_HEIGHT.heading : LINE_HEIGHT.body);

/** Body lines of each page with their page-relative line numbers, header and footer removed. */
export function bodyLines(pages: PdfPage[]): { page: number; line: number; l: PdfTextLine }[] {
  const out: { page: number; line: number; l: PdfTextLine }[] = [];
  for (const p of pages) {
    let n = 0;
    for (const l of p.lines) {
      if (l.top < BOILERPLATE_TOP || l.top > BOILERPLATE_BOTTOM) continue;
      out.push({ page: p.page, line: ++n, l });
    }
  }
  return out;
}

/** Merge wrapped continuation lines: same page, same kind, exactly one line height below. */
function blocks(pages: PdfPage[]): Block[] {
  const out: Block[] = [];
  let prevTop = -Infinity;
  for (const { page, line, l } of bodyLines(pages)) {
    const kind = kindOf(l.size);
    const last = out[out.length - 1];
    const cont = last && last.kind === kind && kind !== "hidden" && last.page === page && l.top - prevTop <= lineHeight(kind) + 0.5;
    if (cont) {
      last.text = `${last.text} ${l.text}`;
      last.lineEnd = line;
    } else out.push({ kind, page, line, lineEnd: line, text: l.text });
    prevTop = l.top;
  }
  return out;
}

const LABEL_TO_KEY = new Map(CONTROL_FIELDS.map((f) => [f.label, f.key]));
const DOC_TYPE_FROM_LABEL = new Map(Object.entries(DOC_TYPE_LABEL).map(([k, v]) => [v, k]));
const BULLET_RE = new RegExp(`^${BULLET}\\s+(.*)$`);

export function parseSopPdf(path: string, pages: PdfPage[], hash: string): Sop {
  const front: Record<string, string> = {};
  const metaLines: Record<string, { page: number; line: number }> = {};
  const sections: Section[] = [];
  let title = "";
  let current: Section | null = null;
  let inControl = false;

  for (const b of blocks(pages)) {
    if (b.kind === "title") {
      title = title ? `${title} ${b.text}` : b.text;
      continue;
    }
    if (b.kind === "heading") {
      if (current) sections.push(current);
      current = null;
      inControl = b.text === CONTROL_SECTION;
      if (!inControl) current = { heading: b.text, page: b.page, lineStart: b.line, lineEnd: b.lineEnd, lines: [] };
      continue;
    }
    if (inControl && b.kind === "body") {
      const m = /^([^:]+):\s*(.*)$/.exec(b.text);
      const key = m ? LABEL_TO_KEY.get((m[1] ?? "").trim()) : undefined;
      if (m && key) {
        front[key] = (m[2] ?? "").trim();
        metaLines[key] = { page: b.page, line: b.line };
      }
      continue;
    }
    if (!current) current = { heading: "Overview", page: b.page, lineStart: b.line, lineEnd: b.lineEnd, lines: [] };
    const entry: SopLine = { page: b.page, line: b.line, lineEnd: b.lineEnd, text: b.text, step: null };
    if (b.kind === "hidden") entry.hidden = true;
    else {
      const step = /^(\d+)\.\s+(.*)$/.exec(b.text);
      const bullet = BULLET_RE.exec(b.text);
      if (step) {
        entry.step = Number(step[1]);
        entry.text = step[2] ?? "";
      } else if (bullet) entry.text = bullet[1] ?? "";
    }
    current.lines.push(entry);
    if (b.page === current.page) current.lineEnd = Math.max(current.lineEnd, b.lineEnd);
  }
  if (current) sections.push(current);

  const need = (k: string): string => {
    const v = front[k];
    if (!v) throw new Error(`${path}: document control field "${k}" not found in the PDF text`);
    return v;
  };
  const module = need("module") as Module;
  if (!MODULES.includes(module)) throw new Error(`${path}: unknown module ${module}`);
  const status = need("status") as DeclaredStatus;
  if (status !== "published" && status !== "draft") throw new Error(`${path}: bad status ${status}`);
  const docTypeLabel = front.doc_type ?? DOC_TYPE_LABEL.sop!;
  const meta: SopFrontMatter = {
    id: need("id"),
    doc_type: (DOC_TYPE_FROM_LABEL.get(docTypeLabel) ?? "sop") as DocType,
    title: title || need("id"),
    module,
    erp_release: need("erp_release"),
    owner_role: need("owner_role"),
    reviewed_on: need("reviewed_on"),
    review_due: need("review_due"),
    status,
  };
  if (front.source_id) meta.source_id = front.source_id;
  if (front.dictionary_refs) meta.dictionary_refs = front.dictionary_refs.split(",").map((x) => x.trim()).filter(Boolean);

  const raw = pages.map((p) => bodyLines([p]).map((x) => x.l.text).join("\n")).join("\n\f\n");
  return { meta, path, format: "pdf", raw, hash, pages: pages.length, sections, metaLines };
}

/** "SOP-AP-004 · p.2 · L7" (or "L7-8" when the passage wraps onto a second line). */
export function formatLocator(loc: { docId: string; page: number; lineStart: number; lineEnd: number }): string {
  const lines = loc.lineEnd > loc.lineStart ? `L${loc.lineStart}-${loc.lineEnd}` : `L${loc.lineStart}`;
  return `${loc.docId} · p.${loc.page} · ${lines}`;
}
