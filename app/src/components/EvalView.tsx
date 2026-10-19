import { report } from "../data";
import { Card, Code, SectionTitle } from "./ui";

const HEADLINE: { key: string; label: string; lowerIsBetter?: boolean }[] = [
  { key: "grounded_answer_rate", label: "Grounded-answer rate" },
  { key: "citation_precision", label: "Citation precision" },
  { key: "citation_recall", label: "Citation recall" },
  { key: "exact_value_accuracy", label: "Exact-value accuracy" },
  { key: "correct_refusal_rate", label: "Correct-refusal rate" },
  { key: "false_refusal_rate", label: "False-refusal rate", lowerIsBetter: true },
  { key: "unsafe_answer_rate", label: "Unsafe-answer rate", lowerIsBetter: true },
  { key: "injection_resistance", label: "Injection resistance" },
  { key: "seeded_defect_detection", label: "Seeded-defect detection" },
  { key: "refusal_reason_accuracy", label: "Refusal reason accuracy" },
  { key: "exact_value_accuracy_when_answered", label: "Exact values, when answered" },
  { key: "injection_outcome_accuracy", label: "Injection probe outcomes" },
];

export function EvalView() {
  const m = report.metrics;
  return (
    <div className="space-y-10">
      <div>
        <div className="inline-flex rounded border border-ink px-2 py-0.5 font-mono text-xs">{report.label}</div>
        <p className="mt-3 max-w-3xl text-sm text-ink-2">
          {report.counts.should_answer} questions should be answered and {report.counts.should_refuse} should be refused. Questions were written before running the
          system and were not edited to pass. Thresholds: BM25 score at least {report.thresholds.min_score}, IDF-weighted term coverage at least{" "}
          {report.thresholds.min_coverage * 100}%. Evaluation date {report.as_of}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {HEADLINE.map((h) => {
          const x = m[h.key];
          if (!x) return null;
          return (
            <Card key={h.key} className="p-4">
              <div className="text-xs text-mute">{h.label}</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{x.value}%</div>
              <div className="mt-1 font-mono text-[11px] text-mute">
                {x.num} / {x.den}
                {h.lowerIsBetter ? " · lower is better" : ""}
              </div>
              <div className="mt-3 h-1 w-full bg-wash">
                <div className="h-1 bg-ink" style={{ width: `${Math.min(100, x.value)}%` }} />
              </div>
              <p className="mt-3 text-[11px] leading-snug text-mute">{x.definition}</p>
            </Card>
          );
        })}
        <Card className="p-4">
          <div className="text-xs text-mute">Latency p50 / p95</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {m.latency_ms.p50}
            <span className="text-base font-normal text-mute"> / {m.latency_ms.p95} ms</span>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-mute">{m.latency_ms.definition} Index build {m.latency_ms.index_build_ms} ms.</p>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div>
          <SectionTitle>Seeded-defect detection by validator</SectionTitle>
          <table className="w-full text-left text-xs">
            <thead className="text-mute">
              <tr className="border-b border-line">
                <th className="py-2 pr-2 font-medium">Validator</th>
                <th className="py-2 pr-2 font-medium">Detected</th>
                <th className="py-2 pr-2 font-medium">Missed</th>
                <th className="py-2 font-medium">Findings on unseeded docs</th>
              </tr>
            </thead>
            <tbody>
              {report.validators.map((v) => (
                <tr key={v.code} className="border-b border-line align-top">
                  <td className="py-2 pr-2">
                    <Code>{v.code}</Code>
                  </td>
                  <td className="py-2 pr-2 font-mono">
                    {v.detected} / {v.seeded}
                    {v.rate !== null ? <span className="text-mute"> ({v.rate}%)</span> : null}
                  </td>
                  <td className="py-2 pr-2 text-ink-2">{v.missed.join("; ") || "none"}</td>
                  <td className="py-2 text-ink-2">{v.unseededFindings.join(", ") || "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-mute">
            Review gate:{" "}
            {report.review_gate.map((g) => `${g.docId} post-approval edit ${g.detected ? "detected" : "missed"} (now ${g.status})`).join("; ")}.
          </p>
        </div>
        <div>
          <SectionTitle>By category</SectionTitle>
          <table className="w-full text-left text-xs">
            <tbody>
              {report.categories.map((c) => (
                <tr key={c.category} className="border-b border-line">
                  <td className="py-2 pr-2">{c.category.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-2 font-mono text-mute">
                    {c.correct} / {c.n}
                  </td>
                  <td className="w-1/2 py-2">
                    <div className="h-1.5 w-full bg-wash">
                      <div className="h-1.5 bg-ink" style={{ width: `${c.rate}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionTitle aside={`${report.misses.length} items`}>Misses and partial misses</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-mute">
              <tr className="border-b border-line">
                <th className="py-2 pr-2 font-medium">Id</th>
                <th className="py-2 pr-2 font-medium">Question</th>
                <th className="py-2 pr-2 font-medium">Expected</th>
                <th className="py-2 pr-2 font-medium">Got</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {report.misses.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="py-2 pr-2 font-mono">{r.id}</td>
                  <td className="py-2 pr-2">
                    {r.question}
                    <div className="text-mute">{r.category.replace(/_/g, " ")}</div>
                  </td>
                  <td className="py-2 pr-2 font-mono text-[11px]">{r.expect === "answer" ? r.expectedCitations.join(", ") : r.expectedReason}</td>
                  <td className="py-2 pr-2 font-mono text-[11px]">{r.got === "answer" ? r.cited.join(", ") : r.gotReason}</td>
                  <td className="py-2 text-ink-2">
                    {r.note || "Reason or value mismatch"}
                    {r.missingValues.length ? <div className="text-mute">Missing values: {r.missingValues.join("; ")}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
