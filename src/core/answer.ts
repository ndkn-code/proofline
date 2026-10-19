// The answerer. Extractive only: every step is a verbatim line from an approved source, with its locator.
// If the evidence is weak, stale, conflicting, held, unapproved or for another release, it refuses and says why.
import { Bm25Index } from "./bm25";
import { ESCALATION_QUEUE, MAX_CANDIDATES, MIN_COVERAGE, MIN_SCORE } from "./config";
import { NO_ANSWER_MESSAGE, REFUSAL_TEXT } from "./refusals";
import { route } from "./router";
import { terms } from "./text";
import type {
  AnswerResult,
  AnswerStep,
  Candidate,
  Citation,
  CorpusIndex,
  Finding,
  IndexedArticle,
  IndexedDictionaryEntry,
  Lane,
  Module,
  RefusalReason,
  RelatedTicket,
} from "./types";

interface DocMeta {
  id: string;
  lane: Exclude<Lane, "ticket">;
  title: string;
  module: Module;
  release: string;
  article?: IndexedArticle;
  entry?: IndexedDictionaryEntry;
}

const isComment = (t: string): boolean => t.trim().startsWith("<!--");

function articleText(a: IndexedArticle): string {
  const body = a.sections.flatMap((s) => [s.heading, ...s.lines.filter((l) => !isComment(l.text)).map((l) => l.text)]);
  return [a.title, a.title, ...body].join("\n");
}

function entryText(e: IndexedDictionaryEntry): string {
  // Index the "Values" label too, since answers quote it ("Values: Open, Closed").
  return [e.term, e.term, e.definition, ...(e.values?.length ? [`Values: ${e.values.join(", ")}`] : [])].join("\n");
}

/** Holds caused only by duplication do not block answers: the canonical copy answers instead. */
function onlyDuplicate(a: IndexedArticle): boolean {
  return a.status === "held" && a.findings.filter((f) => f.severity === "block").every((f) => f.code === "DUPLICATE_CONTENT");
}

function reasonFor(doc: DocMeta, targetRelease: string): { reason: RefusalReason; findings: Finding[]; why: string } {
  if (doc.release !== targetRelease) {
    return { reason: "VERSION_MISMATCH", findings: [], why: `Only available for release ${doc.release}.` };
  }
  const a = doc.article;
  if (!a) return { reason: "NO_APPROVED_EVIDENCE", findings: [], why: "Not eligible." };
  const blocking = a.findings.filter((f) => f.severity === "block");
  if (a.status === "draft") return { reason: "NOT_APPROVED", findings: [], why: a.gate.reasons.join(" ") };
  if (a.status === "stale") return { reason: "SOURCE_STALE", findings: blocking, why: `Review was due ${a.review_due}.` };
  if (blocking.some((f) => f.code === "UNRESOLVED_CONFLICT")) {
    return { reason: "CONFLICTING_EVIDENCE", findings: blocking, why: "On hold: conflicts with another current job aid." };
  }
  if (blocking.some((f) => f.code === "VERSION_MISMATCH")) {
    return { reason: "VERSION_MISMATCH", findings: blocking, why: "On hold: relies on a dictionary entry from another release." };
  }
  return { reason: "SOURCE_ON_HOLD", findings: blocking, why: `On hold: ${[...new Set(blocking.map((f) => f.code))].join(", ")}.` };
}

export interface Answerer {
  ask(question: string): AnswerResult;
}

export function createAnswerer(index: CorpusIndex): Answerer {
  const docs: DocMeta[] = [
    ...index.articles.map((a) => ({ id: a.id, lane: "job_aid" as const, title: a.title, module: a.module, release: a.erp_release, article: a })),
    ...index.dictionary.map((e) => ({ id: e.id, lane: "dictionary" as const, title: `${e.term} (release ${e.erp_release})`, module: e.module, release: e.erp_release, entry: e })),
  ];
  const byId = new Map(docs.map((d) => [d.id, d]));
  const bm25 = new Bm25Index(docs.map((d) => ({ id: d.id, text: d.article ? articleText(d.article) : entryText(d.entry!) })));

  const usableTickets = index.tickets.filter((t) => !t.flagged.includes("PROMPT_INJECTION_IN_SOURCE"));
  const ticketIndex = new Bm25Index(usableTickets.map((t) => ({ id: t.id, text: `${t.redacted.subject}\n${t.redacted.description}\n${t.redacted.resolution}` })));
  const ticketById = new Map(usableTickets.map((t) => [t.id, t]));

  /** A dictionary entry is looked up by its term name: its most specific term word must be in the question. */
  function termNameMatch(e: IndexedDictionaryEntry, q: Set<string>): boolean {
    const nameTerms = [...new Set(terms(e.term))];
    if (nameTerms.length === 0) return false;
    const rarest = [...nameTerms].sort((x, y) => bm25.idf(y) - bm25.idf(x))[0]!;
    const hits = nameTerms.filter((t) => q.has(t)).length;
    return q.has(rarest) && hits >= Math.max(1, nameTerms.length - 1);
  }

  function ask(question: string): AnswerResult {
    const t0 = performance.now();
    const r = route(question);
    const base: AnswerResult = {
      question,
      kind: "refusal",
      release: r.release,
      releaseExplicit: r.releaseExplicit,
      routedModules: r.modules,
      steps: [],
      citations: [],
      refusal: null,
      candidates: [],
      excluded: [],
      relatedTickets: [],
      latencyMs: 0,
    };
    const finish = (res: AnswerResult): AnswerResult => ({ ...res, latencyMs: performance.now() - t0 });
    const refuse = (reason: RefusalReason, detail: string, blockingDocId: string | null = null, findings: Finding[] = [], module?: Module): AnswerResult =>
      finish({
        ...base,
        refusal: {
          reason,
          message: NO_ANSWER_MESSAGE,
          explanation: `${REFUSAL_TEXT[reason].explain} ${detail}`.trim(),
          escalateTo: ESCALATION_QUEUE[module ?? r.modules[0] ?? "default"] ?? ESCALATION_QUEUE.default!,
          blockingDocId,
          blockingFindings: findings,
        },
      });

    if (r.userOverride) return refuse("OUT_OF_SCOPE", "The question asks the assistant to change its own rules. Sources and questions are treated as data, not instructions.");
    if (r.exception) return refuse("EXCEPTION_REQUIRES_HUMAN", "No job aid can grant an exception.");
    if (!r.inScope) return refuse("OUT_OF_SCOPE", "No finance module matched the question.");
    if (r.queryTerms.length === 0) return refuse("NO_APPROVED_EVIDENCE", "The question has no searchable terms.");

    const qset = new Set(r.queryTerms);
    const pool = docs.filter((d) => r.modules.includes(d.module));
    const hits = bm25.search(r.queryTerms, pool.map((d) => d.id));

    const scored = hits.map((h) => {
      const d = byId.get(h.id)!;
      const passes = h.score >= MIN_SCORE && h.coverage >= MIN_COVERAGE && (d.lane !== "dictionary" || termNameMatch(d.entry!, qset));
      const inRelease = d.release === r.release;
      const eligible = inRelease && (d.lane === "dictionary" || d.article!.status === "published");
      return { h, d, passes, inRelease, eligible };
    });

    const toCandidate = (x: (typeof scored)[number], why: string | null): Candidate => ({
      docId: x.d.id,
      lane: x.d.lane,
      title: x.d.title,
      module: x.d.module,
      erp_release: x.d.release,
      status: x.d.article ? x.d.article.status : "published",
      score: Number(x.h.score.toFixed(3)),
      coverage: Number(x.h.coverage.toFixed(3)),
      answerable: x.eligible && x.passes,
      excludedBecause: why,
    });

    const failWhy = (x: (typeof scored)[number]): string =>
      x.h.score < MIN_SCORE
        ? `Score below ${MIN_SCORE}`
        : x.h.coverage < MIN_COVERAGE
          ? `Term coverage below ${MIN_COVERAGE * 100}%`
          : "Dictionary term not named in the question";
    base.candidates = scored.filter((x) => x.eligible).slice(0, MAX_CANDIDATES).map((x) => toCandidate(x, x.passes ? null : failWhy(x)));
    base.excluded = scored
      .filter((x) => !x.eligible && x.passes && !(x.d.article && onlyDuplicate(x.d.article)))
      .slice(0, MAX_CANDIDATES)
      .map((x) => toCandidate(x, reasonFor(x.d, r.release).why));

    // Related tickets: context only, never cited, injection-flagged tickets removed, restricted data masked.
    const ticketPool = usableTickets.filter((t) => r.modules.includes(t.module)).map((t) => t.id);
    base.relatedTickets = ticketIndex
      .search(r.queryTerms, ticketPool)
      .filter((h) => h.score >= MIN_SCORE / 2)
      .slice(0, 3)
      .map((h): RelatedTicket => {
        const t = ticketById.get(h.id)!;
        return { id: t.id, subject: t.redacted.subject, resolution: t.redacted.resolution, score: Number(h.score.toFixed(3)) };
      });

    const passing = scored.filter((x) => x.passes);
    const preferLane = r.intent === "definition" ? "dictionary" : "job_aid";
    const answerable = passing.filter((x) => x.eligible);
    const best = answerable.find((x) => x.d.lane === preferLane) ?? answerable[0];

    // A stronger in-release match that is not eligible blocks a weaker answer: answering from the
    // runner-up would hide that the best evidence is stale, conflicting, held or unapproved.
    const blocker = passing.find((x) => x.inRelease && !x.eligible && !(x.d.article && onlyDuplicate(x.d.article)));
    if (blocker && (!best || blocker.h.score > best.h.score)) {
      const { reason, findings, why } = reasonFor(blocker.d, r.release);
      return refuse(reason, `Closest source: ${blocker.d.id} "${blocker.d.title}". ${why}`, blocker.d.id, findings, blocker.d.module);
    }

    if (!best) {
      const other = passing.find((x) => !x.inRelease && (x.d.lane === "dictionary" || x.d.article!.status === "published"));
      if (other) {
        return refuse("VERSION_MISMATCH", `You asked about release ${r.release}. ${other.d.id} "${other.d.title}" applies to release ${other.d.release} only.`, other.d.id, [], other.d.module);
      }
      const top = scored[0];
      const detail = top
        ? `Best match ${top.d.id} scored ${top.h.score.toFixed(2)} with ${(top.h.coverage * 100).toFixed(0)}% term coverage (needs ${MIN_SCORE} and ${(MIN_COVERAGE * 100).toFixed(0)}%).`
        : "Nothing in the routed modules matched.";
      return refuse("NO_APPROVED_EVIDENCE", detail);
    }

    // Compose the extractive answer.
    const citations: Citation[] = [];
    const steps: AnswerStep[] = [];
    const d = best.d;
    if (d.lane === "dictionary") {
      const e = d.entry!;
      const quote = e.values?.length ? `${e.definition} Values: ${e.values.join(", ")}.` : e.definition;
      citations.push({
        n: 1,
        docId: e.id,
        lane: "dictionary",
        title: e.term,
        locator: { docId: e.id, section: "definition", lineStart: 1, lineEnd: 1 },
        quote,
        sourceHash: e.hash,
        draftHash: e.hash,
        publishedHash: e.hash,
        erp_release: e.erp_release,
      });
      steps.push({ n: 1, kind: "definition", text: `${e.term} (release ${e.erp_release}): ${quote}`, citation: 1 });
    } else {
      const a = d.article!;
      const wanted = ["Before you start", "Steps", "Notes"];
      for (const heading of wanted) {
        const sec = a.sections.find((s) => s.heading === heading);
        if (!sec) continue;
        for (const line of sec.lines) {
          if (isComment(line.text)) continue;
          const n = citations.length + 1;
          citations.push({
            n,
            docId: a.id,
            lane: "job_aid",
            title: a.title,
            locator: { docId: a.id, section: heading, lineStart: line.line, lineEnd: line.line },
            quote: line.text,
            sourceHash: a.provenance.sourceHash,
            draftHash: a.provenance.draftHash,
            publishedHash: a.provenance.publishedHash,
            erp_release: a.erp_release,
          });
          steps.push({ n: heading === "Steps" ? (line.step ?? n) : n, kind: heading === "Steps" ? "step" : "note", text: line.text, citation: n });
        }
      }
    }
    return finish({ ...base, kind: "answer", steps, citations });
  }

  return { ask };
}
