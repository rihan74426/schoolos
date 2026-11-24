import * as React from "react";

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-card border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
      <span aria-hidden="true" className="mb-1 grid size-10 place-items-center rounded-full bg-brand-soft text-lg text-brand">◌</span>
      <p className="m-0 text-sm font-semibold text-fg">{title}</p>
      {children ? <p className="m-0 max-w-sm text-xs text-fg-muted">{children}</p> : null}
    </div>
  );
}
