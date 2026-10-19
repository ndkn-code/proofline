// Core types for Proofline. Everything here is isomorphic (safe for Node and the browser).

export type Module =
  | "General Ledger"
  | "Accounts Payable"
  | "Procurement"
  | "Planning"
  | "Expenses";

export const MODULES: Module[] = [
  "General Ledger",
  "Accounts Payable",
  "Procurement",
  "Planning",
  "Expenses",
];

/** Evidence lanes. Only SOPs and release-matched dictionary entries carry authority. */
export type Lane = "sop" | "dictionary" | "ticket";

export type DeclaredStatus = "published" | "draft";
export type EffectiveStatus = "published" | "held" | "draft" | "stale";

/** Kinds of knowledge documentation in the corpus. Both are rendered as controlled PDFs. */
export type DocType = "sop" | "knowledge_article";

/**
 * A line-addressed passage. For SOP PDFs, page is the PDF page and lines are the visual text lines on
 * that page (running header and footer excluded), so "SOP-AP-004 p.2 L7" points at what a reader sees.
 * For Markdown source captures, page is 1 and lines are file lines.
 */
export interface Locator {
  docId: string;
  section: string;
  page: number;
  lineStart: number;
  lineEnd: number;
}

export interface SopLine {
  /** 1-based page number (always 1 for Markdown). */
  page: number;
  /** 1-based first line on the page (PDF) or in the file (Markdown). */
  line: number;
  /** Last line of the passage. Larger than line when a long sentence wraps in the PDF. */
  lineEnd: number;
  text: string;
  /** Step number when the line is a numbered step, otherwise null. */
  step: number | null;
  /** Text a reader cannot see: 1pt white text in a PDF, or an HTML comment in Markdown. Never quoted. */
  hidden?: boolean;
}

export interface Section {
  heading: string;
  page: number;
  lineStart: number;
  lineEnd: number;
  lines: SopLine[];
}

export interface SopFrontMatter {
  id: string;
  doc_type: DocType;
  title: string;
  module: Module;
  erp_release: string;
  owner_role: string;
  reviewed_on: string;
  review_due: string;
  status: DeclaredStatus;
  source_id?: string;
  dictionary_refs?: string[];
}

export interface Sop {
  meta: SopFrontMatter;
  path: string;
  /** "pdf" when ingested from data/pdf (the normal path); "markdown" in unit tests. */
  format: "pdf" | "markdown";
  /** Extracted text, page by page. Used for pattern scans; the PDF bytes are what gets hashed. */
  raw: string;
  /** SHA-256 of the exact PDF bytes (or of the Markdown text in unit tests). Approvals bind to this. */
  hash: string;
  pages: number;
  sections: Section[];
  /** Where each document-control field sits, so metadata findings get a page and line too. */
  metaLines: Record<string, { page: number; line: number }>;
}

/** Upstream procedure capture that an SOP was drafted from. */
export interface SourceDoc {
  id: string;
  path: string;
  raw: string;
  hash: string;
  sections: Section[];
}

export interface DictionaryEntry {
  id: string;
  term: string;
  module: Module;
  erp_release: string;
  definition: string;
  values?: string[];
  hash?: string;
}

export interface Ticket {
  id: string;
  module: Module;
  opened_on: string;
  subject: string;
  description: string;
  resolution: string;
  hash?: string;
}

export type FindingCode =
  | "FACT_WITHOUT_EVIDENCE"
  | "EXACT_VALUE_ALTERED"
  | "UNRESOLVED_CONFLICT"
  | "STALE_SOURCE"
  | "VERSION_MISMATCH"
  | "TICKET_AS_AUTHORITY"
  | "RESTRICTED_DATA"
  | "PROMPT_INJECTION_IN_SOURCE"
  | "DUPLICATE_CONTENT";

export const FINDING_CODES: FindingCode[] = [
  "FACT_WITHOUT_EVIDENCE",
  "EXACT_VALUE_ALTERED",
  "UNRESOLVED_CONFLICT",
  "STALE_SOURCE",
  "VERSION_MISMATCH",
  "TICKET_AS_AUTHORITY",
  "RESTRICTED_DATA",
  "PROMPT_INJECTION_IN_SOURCE",
  "DUPLICATE_CONTENT",
];

export interface Finding {
  code: FindingCode;
  /** "block" findings put a published SOP on HOLD. "warn" findings are informational. */
  severity: "block" | "warn";
  docId: string;
  lane: Lane;
  detail: string;
  locator?: Locator;
  relatedId?: string;
}

export interface Approval {
  doc_id: string;
  draft_hash: string;
  reviewer_role: string;
  approved_on: string;
}

export interface Provenance {
  sourceId: string | null;
  sourceHash: string | null;
  draftHash: string;
  publishedHash: string | null;
}

export interface GateResult {
  status: EffectiveStatus;
  approval: Approval | null;
  approvalValid: boolean;
  /** Set when an approval exists but was bound to a different draft hash. */
  approvalInvalidatedFrom: string | null;
  reasons: string[];
}

/** One indexed record as consumed by the answerer and the UI. */
export interface IndexedSop {
  id: string;
  title: string;
  module: Module;
  erp_release: string;
  owner_role: string;
  reviewed_on: string;
  review_due: string;
  declared_status: DeclaredStatus;
  status: EffectiveStatus;
  doc_type: DocType;
  /** Path of the PDF that was ingested. */
  path: string;
  pages: number;
  provenance: Provenance;
  gate: GateResult;
  findings: Finding[];
  sections: Section[];
  duplicateOf: string | null;
}

export interface IndexedDictionaryEntry extends DictionaryEntry {
  hash: string;
  path: string;
}

export interface IndexedTicket extends Ticket {
  hash: string;
  flagged: FindingCode[];
  /** Ticket text with restricted patterns masked. Tickets are context only, never cited. */
  redacted: { subject: string; description: string; resolution: string };
}

export interface CorpusIndex {
  generated_from: string;
  as_of: string;
  current_release: string;
  releases: string[];
  sops: IndexedSop[];
  dictionary: IndexedDictionaryEntry[];
  tickets: IndexedTicket[];
  findings: Finding[];
  versions: { kind: string; id: string; hash: string }[];
}

export type RefusalReason =
  | "OUT_OF_SCOPE"
  | "EXCEPTION_REQUIRES_HUMAN"
  | "NO_APPROVED_EVIDENCE"
  | "SOURCE_STALE"
  | "CONFLICTING_EVIDENCE"
  | "SOURCE_ON_HOLD"
  | "NOT_APPROVED"
  | "VERSION_MISMATCH";

export interface Citation {
  n: number;
  docId: string;
  lane: Lane;
  title: string;
  locator: Locator;
  quote: string;
  sourceHash: string | null;
  draftHash: string;
  publishedHash: string | null;
  erp_release: string;
}

export interface AnswerStep {
  n: number;
  kind: "step" | "note" | "definition";
  text: string;
  citation: number;
}

export interface Candidate {
  docId: string;
  lane: Lane;
  title: string;
  module: Module;
  erp_release: string;
  status: EffectiveStatus;
  score: number;
  coverage: number;
  answerable: boolean;
  excludedBecause: string | null;
}

export interface RelatedTicket {
  id: string;
  subject: string;
  resolution: string;
  score: number;
}

export interface AnswerResult {
  question: string;
  kind: "answer" | "refusal";
  release: string;
  releaseExplicit: boolean;
  routedModules: Module[];
  steps: AnswerStep[];
  citations: Citation[];
  refusal: null | {
    reason: RefusalReason;
    message: string;
    explanation: string;
    escalateTo: string;
    blockingDocId: string | null;
    blockingFindings: Finding[];
  };
  /** At most MAX_CANDIDATES eligible matches: published, not held, right release. */
  candidates: Candidate[];
  /** Strong matches that were not eligible, with the reason. Used to explain refusals. */
  excluded: Candidate[];
  relatedTickets: RelatedTicket[];
  latencyMs: number;
}
