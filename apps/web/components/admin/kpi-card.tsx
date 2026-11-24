import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/server/dashboard";

const dot: Record<Kpi["tone"], string> = { ok: "bg-ok", warn: "bg-warn", err: "bg-err", brand: "bg-brand" };

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <Link
      href={kpi.href}
      className="group grid min-h-28 content-between gap-2 rounded-card border border-line bg-surface p-4 shadow-card transition duration-200 ease-brand motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg"
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <span aria-hidden="true" className={cn("size-2 rounded-full", dot[kpi.tone])} />
        {kpi.label}
      </span>
      <span className="text-2xl font-bold tracking-tight text-fg">{kpi.value}</span>
      <span className="truncate text-xs text-fg-muted">{kpi.hint}</span>
    </Link>
  );
}
