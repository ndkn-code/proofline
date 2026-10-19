// Route-first: decide scope, intent, release and module before any retrieval happens.
import { CURRENT_RELEASE, RELEASES } from "./config";
import { stem, terms } from "./text";
import type { Module } from "./types";

const LEXICON: Record<Module, string[]> = {
  "General Ledger": ["journal", "ledger", "gl", "period", "close", "closing", "reopen", "trial", "balance", "intercompany", "reverse", "reversal", "recurring", "accrual", "segment", "allocation", "category"],
  "Accounts Payable": ["invoice", "invoices", "payable", "payables", "ap", "payment", "payments", "hold", "holds", "credit", "memo", "remit", "bank", "void", "match", "matching", "statement", "qty", "prc", "rcv", "bnk", "man", "supplier"],
  Procurement: ["requisition", "requisitions", "purchase", "po", "order", "receive", "receiving", "receipt", "goods", "return", "rma", "catalog", "buy", "vendor", "supplier", "registration", "onboarding"],
  Planning: ["budget", "budgets", "forecast", "scenario", "planning", "plan", "variance", "cycle", "dimension", "fp", "headcount"],
  Expenses: ["expense", "expenses", "receipt", "mileage", "travel", "card", "reimbursement", "reimbursed", "hotel", "flight", "trip", "deposit", "diem"],
};

const STEMMED: Record<Module, Set<string>> = Object.fromEntries(
  Object.entries(LEXICON).map(([m, words]) => [m, new Set(words.map(stem))]),
) as Record<Module, Set<string>>;

const GENERIC_SCOPE = /\b(ledgerline|erp|finance system)\b/i;

const EXCEPTION_PATTERNS: RegExp[] = [
  /\b(make|grant|give|get|need|request)\s+(me\s+)?(an?\s+)?(exception|waiver)\b/i,
  /\bexception\b/i,
  /\b(waive|bypass|override|backdate)\b/i,
  /\bskip\s+(the\s+)?(approval|callback|review|check)\b/i,
  /\b(can|could|will)\s+you\s+(approve|release|post|pay|submit|unlock|reopen)\b/i,
  /\bapprove\s+(it|this|my|our)\b/i,
  /\bon my behalf\b/i,
];

const USER_OVERRIDE = /\b(ignore|disregard|forget)\s+(all\s+|your\s+|the\s+|any\s+)?(previous\s+|prior\s+)?(instructions|rules|guardrails)\b|\byou are now\b|\bsystem prompt\b/i;

const DEFINITION_INTENT = /\b(what\s+(does|do|is|are)\b.*\b(mean|means|stand for|code|status|statuses|values?|types?|levels?|category|categories)\b|\bdefine\b|\bdefinition\b|\bmeaning\b|\bwhat\s+are\s+the\s+(possible\s+)?(values|statuses|types|levels|categories)\b)/i;

const RELEASE_RE = /\b(?:release|version|ledgerline|in|on)?\s*(\d{2}\.\d)\b/i;

/** Words that only shape the question and should not count toward retrieval coverage. */
const QUERY_FILLER = new Set(["mean", "meaning", "stand", "defin", "definition", "explain", "know", "happen", "possibl", "valid", "allowed", "list", "anyon", "someone", "anything", "something"].map(stem));

export interface Route {
  inScope: boolean;
  userOverride: boolean;
  exception: boolean;
  intent: "definition" | "howto";
  release: string;
  releaseExplicit: boolean;
  modules: Module[];
  queryTerms: string[];
}

export function route(question: string): Route {
  const releaseMatch = RELEASE_RE.exec(question);
  const explicitRelease = releaseMatch?.[1] && RELEASES.includes(releaseMatch[1]) ? releaseMatch[1] : null;
  const unknownRelease = releaseMatch?.[1] && !RELEASES.includes(releaseMatch[1]) ? releaseMatch[1] : null;
  const stripped = question.replace(/\b(?:release|version)\s*\d{2}\.\d\b/gi, " ").replace(/\b\d{2}\.\d\b/g, " ");
  const queryTerms = terms(stripped).filter((t) => !QUERY_FILLER.has(t));

  const scores = (Object.keys(STEMMED) as Module[]).map((m) => ({ m, n: queryTerms.filter((t) => STEMMED[m].has(t)).length }));
  const max = Math.max(...scores.map((s) => s.n));
  const modules = max > 0 ? scores.filter((s) => s.n === max).map((s) => s.m) : [];
  const generic = GENERIC_SCOPE.test(question);

  return {
    inScope: modules.length > 0 || generic,
    userOverride: USER_OVERRIDE.test(question),
    exception: EXCEPTION_PATTERNS.some((re) => re.test(question)),
    intent: DEFINITION_INTENT.test(question) ? "definition" : "howto",
    release: explicitRelease ?? unknownRelease ?? CURRENT_RELEASE,
    releaseExplicit: Boolean(explicitRelease ?? unknownRelease),
    modules: modules.length ? modules : generic ? (Object.keys(STEMMED) as Module[]) : [],
    queryTerms,
  };
}
