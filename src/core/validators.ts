// Deterministic validators. Each returns findings with a locator; none of them call a model.
import { CONFLICT_SENTENCE_JACCARD, DUPLICATE_JACCARD, SUPPORT_COVERAGE } from "./config";
import { sectionText } from "./markdown";
import { extractExactValues, jaccard, maskValues, shingles, splitSentences, terms } from "./text";
import type { Sop, SopLine, DictionaryEntry, Finding, Locator, SourceDoc, Ticket } from "./types";

export interface ValidatorInput {
  sops: Sop[];
  sources: SourceDoc[];
  dictionary: DictionaryEntry[];
  tickets: Ticket[];
  asOf: string;
}

function lineLocator(docId: string, section: string, l: Pick<SopLine, "page" | "line" | "lineEnd">): Locator {
  return { docId, section, page: l.page, lineStart: l.line, lineEnd: l.lineEnd };
}

/** Locator of a document-control field (PDF page 1 control block, or Markdown front matter). */
function metaLocator(a: Sop, key: string): Locator {
  const m = a.metaLines[key] ?? a.metaLines.id ?? { page: 1, line: 1 };
  return { docId: a.meta.id, section: "document control", page: m.page, lineStart: m.line, lineEnd: m.line };
}

/** Every line with its section, hidden text included (for pattern scans). */
function allLines(a: Sop): { section: string; line: SopLine }[] {
  return a.sections.flatMap((s) => s.lines.map((l) => ({ section: s.heading, line: l })));
}

/** Lines that state facts: everything except the Purpose summary and hidden text. */
function factLines(a: Sop): { section: string; line: SopLine }[] {
  return allLines(a).filter((x) => x.section !== "Purpose" && !x.line.hidden);
}

function allSourceLines(src: SourceDoc): string[] {
  return src.sections.flatMap((s) => s.lines.map((l) => l.text));
}

function support(lineText: string, sourceLines: string[]): { best: string | null; coverage: number } {
  const t = new Set(terms(lineText));
  if (t.size === 0) return { best: null, coverage: 1 };
  let best: string | null = null;
  let bestCov = 0;
  for (const sl of sourceLines) {
    const st = new Set(terms(sl));
    let hit = 0;
    for (const x of t) if (st.has(x)) hit++;
    const cov = hit / t.size;
    if (cov > bestCov) {
      bestCov = cov;
      best = sl;
    }
  }
  return { best, coverage: bestCov };
}

const isTicketId = (id: string | undefined): boolean => !!id && /^TCK-\d+$/.test(id);

// ---------------------------------------------------------------- STALE_SOURCE
export function checkStale(sops: Sop[], asOf: string): Finding[] {
  return sops
    .filter((a) => a.meta.review_due < asOf)
    .map((a) => ({
      code: "STALE_SOURCE" as const,
      severity: "block" as const,
      docId: a.meta.id,
      lane: "sop" as const,
      detail: `Review was due ${a.meta.review_due}; evaluation date is ${asOf}.`,
      locator: metaLocator(a, "review_due"),
    }));
}

// ------------------------------------------------- FACT_WITHOUT_EVIDENCE + EXACT_VALUE_ALTERED
export function checkEvidence(sops: Sop[], sources: SourceDoc[]): Finding[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: Finding[] = [];
  for (const a of sops) {
    const sid = a.meta.source_id;
    if (isTicketId(sid)) continue; // handled by TICKET_AS_AUTHORITY
    const src = sid ? byId.get(sid) : undefined;
    if (!src) {
      out.push({
        code: "FACT_WITHOUT_EVIDENCE",
        severity: "block",
        docId: a.meta.id,
        lane: "sop",
        detail: sid ? `Cited source ${sid} was not found in the source store.` : "Sop declares no source_id.",
        locator: metaLocator(a, sid ? "source_id" : "id"),
      });
      continue;
    }
    const srcLines = allSourceLines(src);
    const srcValues = new Set(extractExactValues(src.raw));
    for (const { section, line } of factLines(a)) {
      const sup = support(line.text, srcLines);
      if (sup.coverage < SUPPORT_COVERAGE) {
        out.push({
          code: "FACT_WITHOUT_EVIDENCE",
          severity: "block",
          docId: a.meta.id,
          lane: "sop",
          detail: `No supporting passage in ${src.id} for: "${line.text}" (best term coverage ${(sup.coverage * 100).toFixed(0)}%).`,
          locator: lineLocator(a.meta.id, section, line),
          relatedId: src.id,
        });
        continue;
      }
      // Line is supported, so every exact value in it must appear verbatim in the source.
      for (const v of extractExactValues(line.text)) {
        if (srcValues.has(v)) continue;
        const sourceVals = sup.best ? extractExactValues(sup.best) : [];
        out.push({
          code: "EXACT_VALUE_ALTERED",
          severity: "block",
          docId: a.meta.id,
          lane: "sop",
          detail: `Value "${v}" does not appear in ${src.id}.${sourceVals.length ? ` Closest source line has: ${sourceVals.map((x) => `"${x}"`).join(", ")}.` : ""}`,
          locator: lineLocator(a.meta.id, section, line),
          relatedId: src.id,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- UNRESOLVED_CONFLICT
interface ValueSentence {
  docId: string;
  section: string;
  line: SopLine;
  text: string;
  values: string[];
  maskedTerms: Set<string>;
}

function valueSentences(a: Sop): ValueSentence[] {
  const out: ValueSentence[] = [];
  for (const { section, line } of factLines(a)) {
    for (const sentence of splitSentences(line.text)) {
      const values = extractExactValues(sentence);
      if (values.length === 0) continue;
      const maskedTerms = new Set(terms(maskValues(sentence)).filter((t) => t !== "valu"));
      if (maskedTerms.size < 3) continue; // too little wording to claim the sentences say the same thing
      out.push({ docId: a.meta.id, section, line, text: sentence, values, maskedTerms });
    }
  }
  return out;
}

export function checkConflicts(sops: Sop[], asOf: string): Finding[] {
  const current = sops.filter((a) => a.meta.status === "published" && a.meta.review_due >= asOf);
  const out: Finding[] = [];
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const a = current[i]!;
      const b = current[j]!;
      if (a.meta.module !== b.meta.module || a.meta.erp_release !== b.meta.erp_release) continue;
      const sa = valueSentences(a);
      const sb = valueSentences(b);
      for (const x of sa) {
        for (const y of sb) {
          if (jaccard(x.maskedTerms, y.maskedTerms) < CONFLICT_SENTENCE_JACCARD) continue;
          const same = x.values.length === y.values.length && x.values.every((v) => y.values.includes(v));
          if (same) continue;
          const detail = (other: ValueSentence, mine: ValueSentence) =>
            `States ${mine.values.join(", ")} where ${other.docId} states ${other.values.join(", ")} for the same rule: "${mine.text}"`;
          out.push({
            code: "UNRESOLVED_CONFLICT",
            severity: "block",
            docId: x.docId,
            lane: "sop",
            detail: detail(y, x),
            locator: lineLocator(x.docId, x.section, x.line),
            relatedId: y.docId,
          });
          out.push({
            code: "UNRESOLVED_CONFLICT",
            severity: "block",
            docId: y.docId,
            lane: "sop",
            detail: detail(x, y),
            locator: lineLocator(y.docId, y.section, y.line),
            relatedId: x.docId,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- VERSION_MISMATCH
export function checkVersions(sops: Sop[], dictionary: DictionaryEntry[]): Finding[] {
  const byId = new Map(dictionary.map((d) => [d.id, d]));
  const out: Finding[] = [];
  for (const a of sops) {
    for (const ref of a.meta.dictionary_refs ?? []) {
      const entry = byId.get(ref);
      const loc = metaLocator(a, "dictionary_refs");
      if (!entry) {
        out.push({ code: "FACT_WITHOUT_EVIDENCE", severity: "block", docId: a.meta.id, lane: "sop", detail: `Dictionary entry ${ref} does not exist.`, locator: loc });
      } else if (entry.erp_release !== a.meta.erp_release) {
        out.push({
          code: "VERSION_MISMATCH",
          severity: "block",
          docId: a.meta.id,
          lane: "sop",
          detail: `Sop is for release ${a.meta.erp_release} but relies on ${ref}, which is authoritative only for release ${entry.erp_release}.`,
          locator: loc,
          relatedId: ref,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- TICKET_AS_AUTHORITY
export function checkTicketAuthority(sops: Sop[]): Finding[] {
  const out: Finding[] = [];
  for (const a of sops) {
    if (isTicketId(a.meta.source_id)) {
      out.push({
        code: "TICKET_AS_AUTHORITY",
        severity: "block",
        docId: a.meta.id,
        lane: "sop",
        detail: `Sop cites past ticket ${a.meta.source_id} as its source. Tickets are evidence of what happened, not approved procedure.`,
        locator: metaLocator(a, "source_id"),
        relatedId: a.meta.source_id,
      });
      continue;
    }
    for (const { section, line } of factLines(a)) {
      const m = /\b(?:per|see|from|according to)\s+(TCK-\d+)/i.exec(line.text);
      if (m) {
        out.push({
          code: "TICKET_AS_AUTHORITY",
          severity: "block",
          docId: a.meta.id,
          lane: "sop",
          detail: `Line relies on ticket ${m[1]} as authority.`,
          locator: lineLocator(a.meta.id, section, line),
          relatedId: m[1],
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- RESTRICTED_DATA
export const RESTRICTED_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "SSN-like number", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "bank account number", re: /\b(?:account|acct)(?:\s+(?:number|no\.?))?\s*:?\s*\d{6,17}\b/gi },
  { name: "routing number", re: /\brouting(?:\s+number)?\s*:?\s*\d{9}\b/gi },
  { name: "card number", re: /\b(?:\d{4}[ -]?){3}\d{4}\b/g },
];

export function findRestricted(text: string): string[] {
  const hits: string[] = [];
  for (const p of RESTRICTED_PATTERNS) {
    for (const _m of text.matchAll(p.re)) hits.push(p.name);
  }
  return [...new Set(hits)];
}

export function redactRestricted(text: string): string {
  let out = text;
  for (const p of RESTRICTED_PATTERNS) out = out.replace(p.re, "[REDACTED]");
  return out;
}

/** First line (any section, hidden text included) that matches, with its page and line locator. */
function locate(a: Sop, predicate: (text: string) => boolean): Locator | undefined {
  const hit = allLines(a).find((x) => predicate(x.line.text));
  return hit ? lineLocator(a.meta.id, hit.section, hit.line) : undefined;
}

export function checkRestricted(sops: Sop[], tickets: Ticket[]): Finding[] {
  const out: Finding[] = [];
  for (const a of sops) {
    const hits = findRestricted(`${a.meta.title}\n${sectionText(a.sections)}`);
    if (hits.length) {
      const locator = locate(a, (t) => findRestricted(t).length > 0);
      out.push({
        code: "RESTRICTED_DATA",
        severity: "block",
        docId: a.meta.id,
        lane: "sop",
        detail: `Contains restricted data pattern(s): ${hits.join(", ")}.`,
        ...(locator ? { locator } : {}),
      });
    }
  }
  for (const t of tickets) {
    const hits = findRestricted(`${t.subject}\n${t.description}\n${t.resolution}`);
    if (hits.length) {
      out.push({ code: "RESTRICTED_DATA", severity: "warn", docId: t.id, lane: "ticket", detail: `Ticket text contains ${hits.join(", ")}. Masked before display.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------- PROMPT_INJECTION_IN_SOURCE
export const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|rules|guidance)/i,
  /disregard (?:all |any |the )?(?:previous|prior|above|system)/i,
  /\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+)?(?:support\s+)?(?:assistant|ai|bot|agent|model|chatbot)\b/i,
  /\bassistant instructions?\b/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /\b(?:tell|instruct) (?:the )?users? to\b/i,
  /<!--[\s\S]*?\b(?:assistant|ai|model|instruction|ignore)\b[\s\S]*?-->/i,
];

export function findInjection(text: string): string | null {
  for (const re of INJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

export function checkInjection(sops: Sop[], sources: SourceDoc[], tickets: Ticket[]): Finding[] {
  const out: Finding[] = [];
  for (const a of sops) {
    // Scan the full extracted text, hidden text included: that is exactly where planted instructions hide.
    const hit = findInjection(`${a.meta.title}\n${a.sections.flatMap((s) => [s.heading, ...s.lines.map((l) => l.text)]).join("\n")}`);
    if (hit) {
      const where = allLines(a).find((x) => findInjection(x.line.text) !== null);
      const hidden = where?.line.hidden ? " It is hidden text (not visible to a reader of the PDF)." : "";
      out.push({
        code: "PROMPT_INJECTION_IN_SOURCE",
        severity: "block",
        docId: a.meta.id,
        lane: "sop",
        detail: `Text addressed to an assistant was found and ignored: "${hit.slice(0, 80)}".${hidden}`,
        ...(where ? { locator: lineLocator(a.meta.id, where.section, where.line) } : {}),
      });
    }
  }
  for (const s of sources) {
    const hit = findInjection(s.raw);
    if (hit) out.push({ code: "PROMPT_INJECTION_IN_SOURCE", severity: "block", docId: s.id, lane: "sop", detail: `Instruction-like text in source: "${hit.slice(0, 80)}".` });
  }
  for (const t of tickets) {
    const hit = findInjection(`${t.subject}\n${t.description}\n${t.resolution}`);
    if (hit) {
      out.push({
        code: "PROMPT_INJECTION_IN_SOURCE",
        severity: "block",
        docId: t.id,
        lane: "ticket",
        detail: `Ticket contains text addressed to an assistant: "${hit.slice(0, 80)}". Excluded from related evidence.`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- DUPLICATE_CONTENT
export function checkDuplicates(sops: Sop[]): Finding[] {
  const pub = sops.filter((a) => a.meta.status === "published").sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  const sh = new Map(pub.map((a) => [a.meta.id, shingles(sectionText(a.sections.filter((s) => s.heading !== "Purpose")))]));
  const out: Finding[] = [];
  const flagged = new Set<string>();
  for (let i = 0; i < pub.length; i++) {
    for (let j = i + 1; j < pub.length; j++) {
      const a = pub[i]!;
      const b = pub[j]!;
      if (flagged.has(b.meta.id)) continue;
      if (a.meta.module !== b.meta.module || a.meta.erp_release !== b.meta.erp_release) continue;
      const sim = jaccard(sh.get(a.meta.id)!, sh.get(b.meta.id)!);
      if (sim >= DUPLICATE_JACCARD) {
        flagged.add(b.meta.id);
        out.push({
          code: "DUPLICATE_CONTENT",
          severity: "block",
          docId: b.meta.id,
          lane: "sop",
          detail: `Near-duplicate of ${a.meta.id} (shingle similarity ${(sim * 100).toFixed(0)}%). ${a.meta.id} stays canonical; this copy is held.`,
          relatedId: a.meta.id,
        });
      }
    }
  }
  return out;
}

export function runValidators(input: ValidatorInput): Finding[] {
  return [
    ...checkStale(input.sops, input.asOf),
    ...checkEvidence(input.sops, input.sources),
    ...checkConflicts(input.sops, input.asOf),
    ...checkVersions(input.sops, input.dictionary),
    ...checkTicketAuthority(input.sops),
    ...checkRestricted(input.sops, input.tickets),
    ...checkInjection(input.sops, input.sources, input.tickets),
    ...checkDuplicates(input.sops),
  ];
}
