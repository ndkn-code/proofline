// Shared layout contract between the SOP PDF renderer (src/pdf/render.ts) and the PDF parser
// (src/core/sop-pdf.ts). The parser reads structure back from font size and vertical spacing only,
// the same signals a real PDF text extractor has. Isomorphic: no Node imports.

export const PAGE = { width: 612, height: 792 } as const;

/** Body content area (top-down coordinates, points). */
export const CONTENT = { left: 72, right: 540, top: 72, bottom: 720 } as const;

/** Running header and footer sit outside the content area and are stripped on extraction. */
export const HEADER_Y = 40;
export const FOOTER_Y = 744;
export const BOILERPLATE_TOP = 62;
export const BOILERPLATE_BOTTOM = 732;

export const SIZE = { title: 16, heading: 12, body: 10, boilerplate: 8, hidden: 1 } as const;
export const LINE_HEIGHT = { title: 20, heading: 16, body: 13 } as const;

/** Extra space between blocks. A wrapped continuation line follows at exactly one line height. */
export const BLOCK_GAP = 5;
export const HEADING_GAP = 10;

/** Indent for the text of numbered steps and bullets (the marker sits in the gutter). */
export const MARKER_INDENT = 20;
export const BULLET = "•";

export const CONTROL_SECTION = "Document control";
export const CONTROL_VALUE_X = 200;

/** Visible document-control labels, mapped to SOP front matter keys. Order is render order. */
export const CONTROL_FIELDS: { label: string; key: string }[] = [
  { label: "Document ID", key: "id" },
  { label: "Document type", key: "doc_type" },
  { label: "Module", key: "module" },
  { label: "ERP release", key: "erp_release" },
  { label: "Owner", key: "owner_role" },
  { label: "Reviewed on", key: "reviewed_on" },
  { label: "Review due", key: "review_due" },
  { label: "Status", key: "status" },
  { label: "Source capture", key: "source_id" },
  { label: "Dictionary references", key: "dictionary_refs" },
];

export const DOC_TYPE_LABEL: Record<string, string> = {
  sop: "Standard operating procedure (SOP)",
  knowledge_article: "Knowledge article",
};

/** Text smaller than this is treated as hidden (a classic place to plant instructions in a PDF). */
export const HIDDEN_MAX_SIZE = 3;
