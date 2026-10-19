// Fixed evaluation clock and thresholds. Fixed values keep ingest, validation and eval deterministic.

/** The "today" used for staleness checks. Override with PROOFLINE_AS_OF for experiments. */
export const DEFAULT_AS_OF = "2026-10-15";

export const CURRENT_RELEASE = "26.1";
export const RELEASES = ["25.2", "26.1"];

/** Retrieval returns at most this many candidates. */
export const MAX_CANDIDATES = 5;

/**
 * Answer gate. A candidate must clear both a raw BM25 floor and a query-term coverage floor.
 * Coverage is the share of distinct query content terms that appear in the document.
 * These were set once from first principles and are not tuned per eval item.
 */
export const MIN_SCORE = 4.0;
export const MIN_COVERAGE = 0.5;

/** Near-duplicate threshold on 3-word shingle Jaccard similarity. */
export const DUPLICATE_JACCARD = 0.6;

/** Masked-sentence similarity needed before two differing values count as a conflict. */
export const CONFLICT_SENTENCE_JACCARD = 0.75;

/** Share of a step's content terms that must be found in one source line to count as supported. */
export const SUPPORT_COVERAGE = 0.6;

export const ESCALATION_QUEUE: Record<string, string> = {
  "General Ledger": "GL Accounting queue (owner: GL Accounting Lead)",
  "Accounts Payable": "AP Operations queue (owner: AP Operations Supervisor)",
  Procurement: "Procurement Operations queue (owner: Procurement Operations Manager)",
  Planning: "FP&A Systems queue (owner: FP&A Systems Analyst)",
  Expenses: "Travel and Expense queue (owner: Travel and Expense Coordinator)",
  default: "Finance Systems help desk (human triage)",
};
