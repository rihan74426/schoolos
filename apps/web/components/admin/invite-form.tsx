"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { InviteState } from "@/app/admin/settings/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="button-link" type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</button>;
}

export function InviteForm({
  action,
  roles,
}: {
  action: (state: InviteState, formData: FormData) => Promise<InviteState>;
  roles: string[];
}) {
  const [state, formAction] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    if (!state?.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form action={formAction} className="form-grid">
      <label>Role
        <select name="role" defaultValue="TEACHER">
          {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>)}
        </select>
      </label>
      <label>Who is it for? (optional note)
        <input name="inviteeNote" maxLength={80} placeholder="e.g. Maulana Karim, Class 6" />
      </label>
      <Submit />
      {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-error"}>{state.message}</p> : null}
      {state?.ok && state.link ? (
        <div className="wide invite-share">
          <input readOnly value={state.link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
          <div className="invite-actions">
            <button type="button" className="button-link" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            <a className="button-link" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(state.shareText ?? state.link)}`}>WhatsApp</a>
            {canShare ? (
              <button type="button" className="button-link" onClick={() => navigator.share({ text: state.shareText, url: state.link }).catch(() => null)}>
                Messenger / other apps
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
