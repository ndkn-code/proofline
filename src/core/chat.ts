// Convert an engine result into a compact chat turn (for the portfolio's message-style demo).
// Nothing here writes new content: steps, notes and quotes are the engine's verbatim SOP lines, and the
// decline sentence is chosen from the refusal reason and the blocking evidence the engine reported.
import type { AnswerResult, Citation, CorpusIndex, Finding } from "./types";

export interface ChatCite {
  doc: string;
  page: number;
  line: number;
}

export interface ChatStep {
  text: string;
  cite: ChatCite;
}

export interface ChatSource {
  doc: string;
  title: string;
  page: number;
  quote: string;
  /** First 12 hex characters of the SHA-256 of the cited PDF version. */
  hash_short: string;
}

export interface ChatTurn {
  question: string;
  outcome: "answer" | "decline";
  steps?: ChatStep[];
  note?: string;
  note_cite?: ChatCite;
  sources?: ChatSource[];
  decline?: { reason_code: string; plain_reason: string; escalate_to: string };
}

const cite = (c: Citation): ChatCite => ({ doc: c.docId, page: c.locator.page, line: c.locator.lineStart });

/** One short sentence explaining a decline, grounded in the engine's refusal details. */
export function plainReason(r: AnswerResult, index: CorpusIndex): string {
  const ref = r.refusal!;
  const id = ref.blockingDocId;
  const sop = id ? index.sops.find((s) => s.id === id) : undefined;
  const has = (code: Finding["code"]) => ref.blockingFindings.find((f) => f.code === code);
  switch (ref.reason) {
    case "CONFLICTING_EVIDENCE": {
      const other = has("UNRESOLVED_CONFLICT")?.relatedId;
      return other ? `${id} and ${other} disagree on this rule.` : "Two approved SOPs disagree on this rule.";
    }
    case "SOURCE_STALE":
      return sop ? `${sop.id} was due for review on ${sop.review_due}.` : "The matching SOP is past its review date.";
    case "SOURCE_ON_HOLD": {
      if (has("PROMPT_INJECTION_IN_SOURCE")) return `${id} is on hold: its PDF hides instructions aimed at the assistant.`;
      if (has("RESTRICTED_DATA")) return `${id} is on hold: it contains restricted data.`;
      if (has("EXACT_VALUE_ALTERED")) return `${id} is on hold: its values do not match the source.`;
      if (has("FACT_WITHOUT_EVIDENCE")) return `${id} is on hold: a step has no supporting source.`;
      if (has("TICKET_AS_AUTHORITY")) return `${id} is on hold: it was written from a past ticket.`;
      return `${id ?? "The matching SOP"} is on hold after failing a check.`;
    }
    case "NOT_APPROVED":
      return sop?.gate.approvalInvalidatedFrom ? `${sop.id} changed after approval and needs re-review.` : `${id ?? "The matching SOP"} is still a draft.`;
    case "VERSION_MISMATCH": {
      const rel = sop?.erp_release ?? index.dictionary.find((d) => d.id === id)?.erp_release;
      return rel ? `I only have this for release ${rel}, not ${r.release}.` : `Nothing approved covers release ${r.release}.`;
    }
    case "EXCEPTION_REQUIRES_HUMAN":
      return "Exceptions need a person to decide, not an SOP.";
    case "OUT_OF_SCOPE":
      return "That is outside the finance SOPs I can quote.";
    case "NO_APPROVED_EVIDENCE":
    default:
      return "No approved SOP covers this yet.";
  }
}

export function toChatTurn(r: AnswerResult, index: CorpusIndex): ChatTurn {
  if (r.kind === "refusal") {
    return {
      question: r.question,
      outcome: "decline",
      decline: { reason_code: r.refusal!.reason, plain_reason: plainReason(r, index), escalate_to: r.refusal!.escalateTo },
    };
  }
  const byN = new Map(r.citations.map((c) => [c.n, c]));
  const stepLines = r.steps.filter((s) => s.kind === "step" || s.kind === "definition");
  const steps: ChatStep[] = stepLines.map((s) => ({ text: s.text, cite: cite(byN.get(s.citation)!) }));
  const noteStep = r.steps.find((s) => s.kind === "note" && byN.get(s.citation)?.locator.section === "Notes");
  const turn: ChatTurn = { question: r.question, outcome: "answer", steps };
  if (noteStep) {
    turn.note = noteStep.text;
    turn.note_cite = cite(byN.get(noteStep.citation)!);
  }
  // One source card per cited PDF page, quoting the first cited step on that page.
  const sources = new Map<string, ChatSource>();
  for (const s of [...stepLines, ...(noteStep ? [noteStep] : [])]) {
    const c = byN.get(s.citation)!;
    const key = `${c.docId}:${c.locator.page}`;
    if (!sources.has(key)) sources.set(key, { doc: c.docId, title: c.title, page: c.locator.page, quote: c.quote, hash_short: (c.draftHash ?? "").slice(0, 12) });
  }
  turn.sources = [...sources.values()];
  return turn;
}
