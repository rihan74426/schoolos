"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { InviteState } from "@/app/admin/settings/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</Button>;
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
        <Select name="role" defaultValue="TEACHER">
          {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>)}
        </Select>
      </label>
      <label>Who is it for? (optional note)
        <Input name="inviteeNote" maxLength={80} placeholder="e.g. Maulana Karim, Class 6" />
      </label>
      <Submit />
      {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-error"}>{state.message}</p> : null}
      {state?.ok && state.link ? (
        <div className="wide invite-share">
          <Input readOnly value={state.link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
          <div className="invite-actions">
            <Button type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
            <a className={buttonVariants({ variant: "secondary" })} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(state.shareText ?? state.link)}`}>WhatsApp</a>
            {canShare ? (
              <Button type="button" onClick={() => navigator.share({ text: state.shareText, url: state.link }).catch(() => null)}>
                Messenger / other apps
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
