// Lexical BM25, implemented from scratch. No external services or embeddings.
import { terms } from "./text";

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
  /** IDF-weighted share of distinct query terms found in the document (0..1). */
  coverage: number;
  matched: string[];
}

export class Bm25Index {
  private readonly k1: number;
  private readonly b: number;
  private readonly tf = new Map<string, Map<string, number>>();
  private readonly len = new Map<string, number>();
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;
  readonly size: number;

  constructor(docs: Bm25Doc[], k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    let total = 0;
    for (const d of docs) {
      const toks = terms(d.text);
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
      this.tf.set(d.id, counts);
      this.len.set(d.id, toks.length);
      total += toks.length;
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.size = docs.length;
    this.avgLen = docs.length ? total / docs.length : 0;
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    return Math.log(1 + (this.size - n + 0.5) / (n + 0.5));
  }

  score(queryTerms: string[], docId: string): Bm25Hit {
    const counts = this.tf.get(docId);
    const dl = this.len.get(docId) ?? 0;
    const uniq = [...new Set(queryTerms)];
    let score = 0;
    let idfAll = 0;
    let idfHit = 0;
    const matched: string[] = [];
    for (const q of uniq) {
      const idf = this.idf(q);
      idfAll += idf;
      const f = counts?.get(q) ?? 0;
      if (f === 0) continue;
      matched.push(q);
      idfHit += idf;
      score += (idf * (f * (this.k1 + 1))) / (f + this.k1 * (1 - this.b + (this.b * dl) / (this.avgLen || 1)));
    }
    return { id: docId, score, coverage: idfAll > 0 ? idfHit / idfAll : 0, matched };
  }

  search(queryTerms: string[], ids: Iterable<string>): Bm25Hit[] {
    const hits: Bm25Hit[] = [];
    for (const id of ids) {
      const h = this.score(queryTerms, id);
      if (h.score > 0) hits.push(h);
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
}
