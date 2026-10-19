import { useMemo, useState, type FormEvent } from "react";
import { REFUSAL_TEXT } from "../../../src/core/refusals";
import type { AnswerResult, Citation } from "../../../src/core/types";
import { answerer, index } from "../data";
import { Card, Code, Hash, SectionTitle, StatusPill } from "./ui";

const EXAMPLES: { q: string; hint: string }[] = [
  { q: "How do I void a supplier payment?", hint: "answer" },
  { q: "A supplier sent new bank details. How do I update them?", hint: "answer" },
  { q: "What does hold code PRC mean in release 25.2?", hint: "dictionary" },
  { q: "When does the planning cycle lock?", hint: "conflict" },
  { q: "How do I cancel a requisition I no longer need?", hint: "stale" },
  { q: "How do I resolve a supplier statement discrepancy?", hint: "injection" },
  { q: "What does hold code BNK mean in release 25.2?", hint: "version" },
  { q: "Can you approve my expense report?", hint: "exception" },
];

export function AskView() {
  const [input, setInput] = useState(EXAMPLES[0]!.q);
  const [result, setResult] = useState<AnswerResult>(() => answerer.ask(EXAMPLES[0]!.q));
  const [active, setActive] = useState<number>(1);

  const run = (q: string) => {
    const r = answerer.ask(q);
    setResult(r);
    setActive(r.citations.length ? 1 : 0);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) run(input.trim());
  };

  const citation = result.citations.find((c) => c.n === active) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Question
          </label>
          <input
            id="q"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how to do something in Ledgerline"
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-[15px] outline-none placeholder:text-mute focus:border-ink"
          />
          <button type="submit" className="h-11 rounded-md bg-ink px-5 text-sm font-medium text-white hover:bg-ink-2">
            Ask
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.q}
              type="button"
              onClick={() => {
                setInput(ex.q);
                run(ex.q);
              }}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink"
            >
              <span className="mr-1.5 text-mute">{ex.hint}</span>
              {ex.q}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <AnswerHeader result={result} />
          {result.kind === "answer" ? <AnswerBody result={result} active={active} onCite={setActive} /> : <RefusalBody result={result} />}
        </div>

        <Retrieval result={result} />
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        {result.kind === "answer" ? <CitationPanel citation={citation} total={result.citations.length} /> : <WhyPanel result={result} />}
      </aside>
    </div>
  );
}

function AnswerHeader({ result }: { result: AnswerResult }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-mute">
      <span className={`rounded px-2 py-0.5 font-medium ${result.kind === "answer" ? "bg-ink text-white" : "border border-ink text-ink"}`}>
        {result.kind === "answer" ? "Answered from approved evidence" : "Refused"}
      </span>
      <span>Release {result.release}{result.releaseExplicit ? " (from question)" : " (default)"}</span>
      <span aria-hidden>·</span>
      <span>Routed to {result.routedModules.length ? result.routedModules.join(", ") : "no module"}</span>
      <span aria-hidden>·</span>
      <span>{result.latencyMs.toFixed(2)} ms</span>
    </div>
  );
}

function Chip({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show citation ${n}`}
      className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 align-[1px] font-mono text-[10px] leading-none ${active ? "border-ink bg-ink text-white" : "border-line bg-wash text-ink-2 hover:border-ink"}`}
    >
      {n}
    </button>
  );
}

function AnswerBody({ result, active, onCite }: { result: AnswerResult; active: number; onCite: (n: number) => void }) {
  const first = result.citations[0];
  const before = result.steps.filter((s) => s.kind === "note" && result.citations[s.citation - 1]?.locator.section === "Before you start");
  const steps = result.steps.filter((s) => s.kind === "step" || s.kind === "definition");
  const notes = result.steps.filter((s) => s.kind === "note" && result.citations[s.citation - 1]?.locator.section === "Notes");
  return (
    <Card className="p-6">
      {first ? (
        <div className="mb-5">
          <div className="text-lg font-semibold tracking-tight">{first.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Code>{first.docId}</Code>
            <span>{first.lane === "dictionary" ? "Data dictionary entry" : "Reviewed job aid"}</span>
            <span aria-hidden>·</span>
            <span>release {first.erp_release}</span>
          </div>
        </div>
      ) : null}
      {before.length ? (
        <div className="mb-5">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">Before you start</div>
          <ul className="space-y-1.5 text-[15px] leading-relaxed">
            {before.map((s) => (
              <li key={s.citation} className="flex gap-2">
                <span className="text-mute">-</span>
                <span>
                  {s.text}
                  <Chip n={s.citation} active={active === s.citation} onClick={() => onCite(s.citation)} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.citation} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink font-mono text-xs">{s.kind === "definition" ? "i" : s.n}</span>
            <span>
              {s.text}
              <Chip n={s.citation} active={active === s.citation} onClick={() => onCite(s.citation)} />
            </span>
          </li>
        ))}
      </ol>
      {notes.length ? (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">Notes</div>
          <ul className="space-y-1.5 text-sm leading-relaxed text-ink-2">
            {notes.map((s) => (
              <li key={s.citation}>
                {s.text}
                <Chip n={s.citation} active={active === s.citation} onClick={() => onCite(s.citation)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-6 text-xs text-mute">Every line above is quoted verbatim from the cited passage. Nothing is paraphrased or generated.</p>
    </Card>
  );
}

function RefusalBody({ result }: { result: AnswerResult }) {
  const r = result.refusal!;
  return (
    <Card className="border-ink p-6">
      <div className="text-2xl font-semibold tracking-tight">{r.message}</div>
      <div className="mt-2 text-sm text-ink-2">
        {REFUSAL_TEXT[r.reason].label}. Escalated to <span className="font-medium text-ink">{r.escalateTo}</span>.
      </div>
      <p className="mt-4 text-xs text-mute">See "Why no answer" for the evidence that was checked.</p>
    </Card>
  );
}

function CitationPanel({ citation, total }: { citation: Citation | null; total: number }) {
  if (!citation) return null;
  const art = index.articles.find((a) => a.id === citation.docId);
  return (
    <Card className="p-5">
      <SectionTitle aside={`${citation.n} of ${total}`}>Citation</SectionTitle>
      <div className="text-sm font-medium">{citation.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mute">
        <Code>{citation.docId}</Code>
        <span>{citation.locator.section}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">
          L{citation.locator.lineStart}
          {citation.locator.lineEnd !== citation.locator.lineStart ? `-L${citation.locator.lineEnd}` : ""}
        </span>
      </div>
      <blockquote className="mt-4 border-l-2 border-ink bg-wash px-4 py-3 text-sm leading-relaxed">{citation.quote}</blockquote>
      {art ? (
        <div className="mt-4 text-xs text-mute">
          <div className="mb-1 font-medium text-ink-2">Passage in context</div>
          <div className="max-h-56 overflow-auto rounded border border-line">
            {art.sections
              .flatMap((s) => s.lines.filter((l) => !l.text.startsWith("<!--")).map((l) => ({ ...l, section: s.heading })))
              .map((l) => (
                <div key={l.line} className={`flex gap-2 px-2 py-0.5 font-mono text-[11px] ${l.line === citation.locator.lineStart ? "bg-ink text-white" : "text-ink-2"}`}>
                  <span className={`w-7 shrink-0 text-right ${l.line === citation.locator.lineStart ? "text-white" : "text-mute"}`}>{l.line}</span>
                  <span className="truncate">{l.text}</span>
                </div>
              ))}
          </div>
        </div>
      ) : null}
      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-ink-2">Provenance</div>
        <ol className="space-y-1.5 text-xs">
          <li className="flex justify-between gap-2">
            <span className="text-mute">Source {art?.provenance.sourceId ?? ""}</span>
            <Hash value={citation.sourceHash} />
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-mute">Approved draft</span>
            <Hash value={citation.draftHash} />
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-mute">Published record</span>
            <Hash value={citation.publishedHash} />
          </li>
        </ol>
        {art?.gate.approval ? (
          <p className="mt-3 text-xs text-mute">
            Approved by {art.gate.approval.reviewer_role} on {art.gate.approval.approved_on}, bound to draft <Hash value={art.gate.approval.draft_hash} />. Review due{" "}
            {art.review_due}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function WhyPanel({ result }: { result: AnswerResult }) {
  const r = result.refusal!;
  const blocking = r.blockingDocId ? (index.articles.find((a) => a.id === r.blockingDocId) ?? null) : null;
  const dict = r.blockingDocId ? (index.dictionary.find((d) => d.id === r.blockingDocId) ?? null) : null;
  return (
    <Card className="p-5">
      <SectionTitle>Why no answer</SectionTitle>
      <div className="flex items-center gap-2">
        <Code>{r.reason}</Code>
      </div>
      <div className="mt-2 text-sm font-medium">{REFUSAL_TEXT[r.reason].label}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{r.explanation}</p>
      {blocking ? (
        <div className="mt-4 rounded border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <Code>{blocking.id}</Code>
            <StatusPill status={blocking.status} />
          </div>
          <div className="mt-2 text-sm">{blocking.title}</div>
          <div className="mt-1 text-xs text-mute">
            Release {blocking.erp_release} · review due {blocking.review_due}
          </div>
          {blocking.gate.reasons.length ? (
            <ul className="mt-3 space-y-2 text-xs text-ink-2">
              {blocking.gate.reasons.map((x) => (
                <li key={x} className="border-l-2 border-line pl-2">
                  {x}
                </li>
              ))}
            </ul>
          ) : null}
          {r.blockingFindings.some((f) => f.locator) ? (
            <div className="mt-3 text-xs text-mute">
              Locators:{" "}
              {r.blockingFindings
                .filter((f) => f.locator)
                .map((f) => `${f.code} at ${f.locator!.section} L${f.locator!.lineStart}`)
                .join("; ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {dict ? (
        <div className="mt-4 rounded border border-line p-3 text-xs text-ink-2">
          <Code>{dict.id}</Code> {dict.term} is authoritative for release {dict.erp_release} only.
        </div>
      ) : null}
      <div className="mt-4 border-t border-line pt-3 text-xs text-mute">
        Escalation: <span className="text-ink-2">{r.escalateTo}</span>
      </div>
    </Card>
  );
}

function Retrieval({ result }: { result: AnswerResult }) {
  const rows = useMemo(() => [...result.candidates.map((c) => ({ ...c, kind: "eligible" as const })), ...result.excluded.map((c) => ({ ...c, kind: "excluded" as const }))], [result]);
  return (
    <div className="mt-10 grid gap-8 xl:grid-cols-2">
      <div>
        <SectionTitle aside="BM25, max 5 eligible">Retrieval</SectionTitle>
        {rows.length === 0 ? (
          <p className="text-sm text-mute">No documents were searched. The question was refused at routing.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-mute">
              <tr className="border-b border-line">
                <th className="py-2 pr-2 font-medium">Doc</th>
                <th className="py-2 pr-2 font-medium">Score</th>
                <th className="py-2 pr-2 font-medium">Coverage</th>
                <th className="py-2 font-medium">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={`${c.kind}-${c.docId}`} className="border-b border-line align-top">
                  <td className="py-2 pr-2">
                    <div className="font-mono text-[11px]">{c.docId}</div>
                    <div className="text-mute">{c.title}</div>
                  </td>
                  <td className="py-2 pr-2 font-mono">{c.score.toFixed(2)}</td>
                  <td className="py-2 pr-2 font-mono">{Math.round(c.coverage * 100)}%</td>
                  <td className="py-2 text-ink-2">{c.kind === "eligible" ? (c.answerable ? "eligible, passes threshold" : (c.excludedBecause ?? "eligible")) : `excluded: ${c.excludedBecause}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <SectionTitle aside="context only, never cited">Related past tickets</SectionTitle>
        {result.relatedTickets.length === 0 ? (
          <p className="text-sm text-mute">No related tickets.</p>
        ) : (
          <ul className="space-y-3">
            {result.relatedTickets.map((t) => (
              <li key={t.id} className="rounded border border-dashed border-line p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Code>{t.id}</Code>
                  <span className="font-medium text-ink-2">{t.subject}</span>
                </div>
                <p className="mt-1.5 text-mute">{t.resolution}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-mute">Tickets show what happened before. They are not procedure, so they can never be cited as an answer. Tickets with injected instructions are excluded and restricted data is masked.</p>
      </div>
    </div>
  );
}
