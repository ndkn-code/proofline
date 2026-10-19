// Tokenization and similarity helpers shared by validators and retrieval. Isomorphic.

export const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could do does did for from has have how i if in into is it its " +
    "me my of on or our so than that the their them then there these they this to up was we were what when " +
    "where which who why will with would you your yours should shall may might must not no yes about after " +
    "before over under again also any all each per via out off just only own same such too very s t step " +
    "steps need want get go use using please tell show way ledgerline"
  ).split(/\s+/),
);

/** Very light suffix stripper. Deterministic and good enough for a small domain corpus. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es") && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export function rawTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Content terms: lowercased, stopwords removed, stemmed. */
export function terms(text: string): string[] {
  return rawTokens(text)
    .filter((t) => !STOPWORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 0);
}

export function shingles(text: string, k = 3): Set<string> {
  const toks = rawTokens(text);
  const out = new Set<string>();
  for (let i = 0; i + k <= toks.length; i++) out.add(toks.slice(i, i + k).join(" "));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Exact values that must survive drafting unchanged: money, percentages, times,
 * day and mile counts, codes such as JE-1001, and menu paths such as "Payables > Invoices".
 */
const VALUE_PATTERNS: RegExp[] = [
  /\$\d[\d,]*(?:\.\d+)?/g, // money
  /\b\d+(?:\.\d+)?\s?%/g, // percent
  /\b\d{1,2}:\d{2}\s?(?:[AP]M)?(?:\s(?:Central|Eastern|UTC))?/g, // clock time
  /\b\d+\s(?:business|calendar)\sdays?\b/g, // day counts
  /\b\d+\sdays?\b/g,
  /\bbusiness day \d+\b/g,
  /\b[A-Z]{2,5}-\d{2,6}\b/g, // codes like JE-1001
  /\b\d{2}\.\d\b/g, // release numbers
  /(?:[A-Z][A-Za-z&]*(?: [A-Z&][A-Za-z&]*)*)(?: > (?:[A-Z][A-Za-z&]*(?: [A-Z&][A-Za-z&]*)*))+/g, // menu paths
];

export function extractExactValues(text: string): string[] {
  const found = new Set<string>();
  for (const re of VALUE_PATTERNS) {
    for (const m of text.matchAll(re)) found.add(m[0].trim());
  }
  // Prefer the longest form when one value contains another (e.g. "5 business days" over "5 days").
  const vals = [...found];
  return vals.filter((v) => !vals.some((o) => o !== v && o.includes(v))).sort();
}

/** Replace exact values with a placeholder so two sentences can be compared by their wording alone. */
export function maskValues(text: string): string {
  let out = text;
  for (const re of VALUE_PATTERNS) out = out.replace(re, " VALUE ");
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
