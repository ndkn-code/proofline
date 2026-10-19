import { Fragment, useMemo, useState } from "react";
import type { EffectiveStatus, IndexedArticle } from "../../../src/core/types";
import { index } from "../data";
import { Card, Code, Hash, SectionTitle, StatusPill } from "./ui";

const FILTERS: ("all" | EffectiveStatus)[] = ["all", "published", "held", "stale", "draft"];

export function GovernanceView() {
  const [filter, setFilter] = useState<"all" | EffectiveStatus>("all");
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: index.articles.length };
    for (const a of index.articles) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, []);
  const rows = index.articles.filter((a) => filter === "all" || a.status === filter);
  const flaggedTickets = index.tickets.filter((t) => t.flagged.length);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border p-4 text-left transition-colors ${filter === f ? "border-ink" : "border-line hover:border-ink-2"}`}
          >
            <div className="text-2xl font-semibold tabular-nums">{counts[f] ?? 0}</div>
            <div className="mt-1 text-xs text-mute capitalize">{f === "all" ? "job aids" : f}</div>
          </button>
        ))}
      </div>

      <div>
        <SectionTitle aside={`Evaluation date ${index.as_of}. Only published articles can be cited.`}>Job aids</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-mute">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Article</th>
                <th className="py-2 pr-3 font-medium">Module</th>
                <th className="py-2 pr-3 font-medium">Release</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Validator findings</th>
                <th className="py-2 pr-3 font-medium">Approval bound to hash</th>
                <th className="py-2 font-medium">Review due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <tr className="cursor-pointer border-b border-line align-top hover:bg-wash" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td className="py-2.5 pr-3">
                      <div className="font-mono text-[11px] text-mute">{a.id}</div>
                      <div>{a.title}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-ink-2">{a.module}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{a.erp_release}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {a.findings.length === 0 ? <span className="text-xs text-mute">none</span> : [...new Set(a.findings.map((f) => f.code))].map((c) => <Code key={c}>{c}</Code>)}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      <ApprovalCell a={a} />
                    </td>
                    <td className={`py-2.5 font-mono text-xs ${a.review_due < index.as_of ? "font-semibold text-ink underline decoration-dotted" : "text-ink-2"}`}>{a.review_due}</td>
                  </tr>
                  {open === a.id ? (
                    <tr className="border-b border-line bg-wash">
                      <td colSpan={7} className="px-4 py-4">
                        <Detail a={a} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mute">Select a row to see findings with line locators and the provenance chain.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle aside={`${index.dictionary.length} entries`}>Data dictionary (version-scoped)</SectionTitle>
          <Card>
            <table className="w-full text-left text-xs">
              <tbody>
                {index.dictionary.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-mono text-[11px] text-mute">{d.id}</td>
                    <td className="px-3 py-2">{d.term}</td>
                    <td className="px-3 py-2 font-mono">{d.erp_release}</td>
                    <td className="px-3 py-2">
                      <Hash value={d.hash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div>
          <SectionTitle aside={`${index.tickets.length} tickets, evidence only`}>Flagged tickets</SectionTitle>
          <div className="space-y-3">
            {flaggedTickets.map((t) => (
              <Card key={t.id} className="p-4 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Code>{t.id}</Code>
                  {t.flagged.map((f) => (
                    <Code key={f}>{f}</Code>
                  ))}
                </div>
                <div className="mt-2 font-medium text-ink-2">{t.redacted.subject}</div>
                <p className="mt-1 text-mute">{t.redacted.description}</p>
                <p className="mt-2 text-ink-2">
                  {t.flagged.includes("PROMPT_INJECTION_IN_SOURCE")
                    ? "Excluded from related evidence. The instruction inside it was treated as data and ignored."
                    : "Restricted data is masked before display."}
                </p>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">
            {index.versions.length} content-hashed versions recorded (articles, sources, dictionary entries, tickets).
          </p>
        </div>
      </div>
    </div>
  );
}

function ApprovalCell({ a }: { a: IndexedArticle }) {
  if (a.gate.approvalValid && a.gate.approval) {
    return (
      <div>
        <Hash value={a.gate.approval.draft_hash} />
        <div className="text-mute">{a.gate.approval.reviewer_role}, valid</div>
      </div>
    );
  }
  if (a.gate.approvalInvalidatedFrom) {
    return (
      <div>
        <span className="font-mono text-[11px] text-mute line-through">{a.gate.approvalInvalidatedFrom.slice(0, 12)}</span>
        <div className="font-medium text-ink">invalidated by edit</div>
      </div>
    );
  }
  return <span className="text-mute">not approved</span>;
}

function Detail({ a }: { a: IndexedArticle }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Gate decision</div>
        {a.gate.reasons.length ? (
          <ul className="space-y-1.5 text-xs text-ink-2">
            {a.gate.reasons.map((r) => (
              <li key={r} className="border-l-2 border-ink pl-2">
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-2">Approved, current and clean. Eligible for answers.</p>
        )}
        {a.findings.length ? (
          <>
            <div className="mt-4 mb-2 text-xs font-medium text-ink-2">Findings</div>
            <ul className="space-y-2 text-xs">
              {a.findings.map((f, i) => (
                <li key={i}>
                  <Code>{f.code}</Code>{" "}
                  {f.locator ? (
                    <span className="font-mono text-[11px] text-mute">
                      {f.locator.section} L{f.locator.lineStart}
                    </span>
                  ) : null}
                  <div className="mt-1 text-ink-2">{f.detail}</div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Provenance chain</div>
        <ol className="space-y-1.5 text-xs">
          <li className="flex justify-between gap-2">
            <span className="text-mute">Source {a.provenance.sourceId ?? "(none)"}</span>
            <Hash value={a.provenance.sourceHash} />
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-mute">Current draft</span>
            <Hash value={a.provenance.draftHash} />
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-mute">Published record</span>
            <Hash value={a.provenance.publishedHash} />
          </li>
        </ol>
        <div className="mt-4 text-xs text-mute">
          Owner {a.owner_role}. Reviewed {a.reviewed_on}. File <span className="font-mono">{a.path}</span>.
        </div>
      </div>
    </div>
  );
}
