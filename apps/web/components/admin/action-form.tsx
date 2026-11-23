"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type State = { ok: boolean; message: string } | null;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button-link" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
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
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-error"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
