import indexJson from "../../data/build/index.json";
import reportJson from "../../eval/report.json";
import { createAnswerer } from "../../src/core/answer";
import type { CorpusIndex } from "../../src/core/types";

export const index = indexJson as unknown as CorpusIndex;
export const answerer = createAnswerer(index);

export interface Metric {
  value: number;
  num: number;
  den: number;
  definition: string;
}

export interface EvalRow {
  id: string;
  category: string;
  question: string;
  expect: string;
  got: string;
  expectedCitations: string[];
  cited: string[];
  expectedReason: string | null;
  gotReason: string | null;
  missingValues: string[];
  correct: boolean;
  reasonMatch: boolean | null;
  note: string;
}

export interface EvalReport {
  label: string;
  as_of: string;
  thresholds: { min_score: number; min_coverage: number };
  counts: { total: number; should_answer: number; should_refuse: number };
  metrics: Record<string, Metric> & { latency_ms: { p50: number; p95: number; max: number; index_build_ms: number; definition: string } };
  validators: { code: string; seeded: number; detected: number; rate: number | null; missed: string[]; unseededFindings: string[] }[];
  review_gate: { docId: string; expected: string; detected: boolean; status: string }[];
  categories: { category: string; n: number; correct: number; rate: number }[];
  misses: EvalRow[];
}

export const report = reportJson as unknown as EvalReport;

export const short = (h: string | null | undefined, n = 10): string => (h ? h.slice(0, n) : "none");
