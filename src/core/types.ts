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

/** Evidence lanes. Only job aids and release-matched dictionary entries carry authority. */
export type Lane = "job_aid" | "dictionary" | "ticket";

export type DeclaredStatus = "published" | "draft";
export type EffectiveStatus = "published" | "held" | "draft" | "stale";

/** A line-addressed passage inside a source file. */
export interface Locator {
  docId: string;
  section: string;
  lineStart: number;
  lineEnd: number;
}

export interface ArticleLine {
  /** 1-based line number in the Markdown file, front matter included. */
  line: number;
  text: string;
  /** Step number when the line is a numbered step, otherwise null. */
  step: number | null;
}

export interface Section {
  heading: string;
  lineStart: number;
  lineEnd: number;
  lines: ArticleLine[];
}

export interface ArticleFrontMatter {
  id: string;
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

export interface Article {
  meta: ArticleFrontMatter;
  path: string;
  raw: string;
  hash: string;
  sections: Section[];
}

/** Upstream procedure capture that an article was drafted from. */
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
  /** "block" findings put a published article on HOLD. "warn" findings are informational. */
  severity: "block" | "warn";
  docId: string;
  lane: Lane;
  detail: string;
  locator?: Locator;
  relatedId?: string;
}

export interface Approval {
  article_id: string;
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
export interface IndexedArticle {
  id: string;
  title: string;
  module: Module;
  erp_release: string;
  owner_role: string;
  reviewed_on: string;
  review_due: string;
  declared_status: DeclaredStatus;
  status: EffectiveStatus;
  path: string;
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
  articles: IndexedArticle[];
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
