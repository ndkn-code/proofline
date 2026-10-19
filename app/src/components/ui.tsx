import type { ReactNode } from "react";
import type { EffectiveStatus } from "../../../src/core/types";
import { short } from "../data";

const STATUS_STYLE: Record<EffectiveStatus, string> = {
  published: "bg-ink text-white border-ink",
  held: "bg-white text-ink border-ink border-2 font-semibold",
  stale: "bg-white text-ink-2 border-ink-2 border-dashed",
  draft: "bg-wash text-mute border-line border-dotted",
};

export function StatusPill({ status }: { status: EffectiveStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 tracking-wide uppercase ${STATUS_STYLE[status]}`}>{status}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="rounded border border-line bg-wash px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</span>;
}

export function Hash({ value, label }: { value: string | null; label?: string }) {
  return (
    <span className="font-mono text-[11px] text-ink-2" title={value ?? "none"}>
      {label ? <span className="text-mute">{label} </span> : null}
      {short(value, 12)}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">{children}</h2>
      {aside ? <div className="text-xs text-mute">{aside}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-white ${className}`}>{children}</div>;
}
