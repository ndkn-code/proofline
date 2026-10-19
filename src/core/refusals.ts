// Refusal reasons shown in the "Why no answer" panel. Every refusal says what was checked and who to ask.
import type { RefusalReason } from "./types";

export const NO_ANSWER_MESSAGE = "No approved answer yet.";

export const REFUSAL_TEXT: Record<RefusalReason, { label: string; explain: string }> = {
  OUT_OF_SCOPE: {
    label: "Out of scope",
    explain: "Proofline only answers how-to questions about the Ledgerline finance modules (General Ledger, Accounts Payable, Procurement, Planning, Expenses).",
  },
  EXCEPTION_REQUIRES_HUMAN: {
    label: "Exception or approval request",
    explain: "The question asks for an exception, an override or an approval decision. Those decisions belong to a person, so the request is routed to the owning team.",
  },
  NO_APPROVED_EVIDENCE: {
    label: "No approved evidence",
    explain: "No reviewed job aid or release-matched dictionary entry covers this question well enough to quote. Proofline does not guess.",
  },
  SOURCE_STALE: {
    label: "Best source is past its review date",
    explain: "The closest job aid is overdue for review, so it is excluded until its owner re-reviews it.",
  },
  CONFLICTING_EVIDENCE: {
    label: "Approved sources disagree",
    explain: "Two current job aids state different values for the same rule. Both are on hold until the owner resolves the conflict.",
  },
  SOURCE_ON_HOLD: {
    label: "Best source is on hold",
    explain: "The closest job aid failed a validator after publication and is on hold. It was not deleted, but it cannot be used for answers.",
  },
  NOT_APPROVED: {
    label: "Best source is not approved",
    explain: "The closest job aid is a draft, or it was edited after approval so the approval no longer matches its content hash.",
  },
  VERSION_MISMATCH: {
    label: "Evidence is for a different Ledgerline release",
    explain: "Approved evidence exists, but only for a different Ledgerline release than the one asked about. Release-specific answers are not carried across versions.",
  },
};
