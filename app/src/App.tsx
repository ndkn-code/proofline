import { useEffect, useState } from "react";
import { AskView } from "./components/AskView";
import { GovernanceView } from "./components/GovernanceView";
import { EvalView } from "./components/EvalView";
import { index, report } from "./data";

type Tab = "ask" | "governance" | "eval";
const TABS: { id: Tab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "governance", label: "Governance" },
  { id: "eval", label: "Eval" },
];

function readHash(): Tab {
  const h = window.location.hash.replace("#", "");
  return h === "governance" || h === "eval" ? h : "ask";
}

export function App() {
  const [tab, setTab] = useState<Tab>(readHash);
  useEffect(() => {
    const on = () => setTab(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-6 pt-6 pb-0">
          <div className="pb-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Proofline</h1>
              <span className="text-xs text-mute">evidence-grounded finance ERP support</span>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-mute">
              Synthetic demo. Halden Supply Co. and the Ledgerline ERP are fictional. Answers are quoted from reviewed job aids only; everything runs
              offline in your browser.
            </p>
          </div>
          <nav className="flex gap-1" aria-label="Views">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={`border-b-2 px-4 pb-3 text-sm transition-colors ${tab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-mute hover:text-ink"}`}
              >
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === "ask" && <AskView />}
        {tab === "governance" && <GovernanceView />}
        {tab === "eval" && <EvalView />}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-5 text-xs text-mute">
          Index as of {index.as_of}, current release {index.current_release}. Eval: {report.label}. A public, synthetic replica inspired by an internal
          concept; contains no employer code or data.
        </div>
      </footer>
    </div>
  );
}
