"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type State = { ok: boolean; message: string } | null;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="justify-self-start">
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "form-grid",
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <Submit label={submitLabel} />
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={cn("m-0 rounded-[10px] px-3 py-2 text-sm", state.ok ? "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok" : "bg-[color-mix(in_srgb,var(--err)_12%,transparent)] text-err")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
