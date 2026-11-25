import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getAlertLocale, getChannelSummary } from "@/server/messaging";
import { saveChannelAction, setAlertLocaleAction, testChannelAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommunicationsPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const canConfigure = can(actor.role, "settings:write");
  const channel = canConfigure ? await getChannelSummary(actor.institutionId) : null;
  const locale = canConfigure ? await getAlertLocale(actor.institutionId) : "en";
  const showFake = process.env.NODE_ENV !== "production" || process.env.ALLOW_FAKE_SMS === "true";

  return (
    <>
      <PageHeading title="Communications" description="Notices and guardian alerts. Each school connects its own SMS provider." />
      <p><Link className={buttonVariants({ variant: "secondary" })} href="/admin/communications/log">Delivery log</Link></p>
      {canConfigure ? (
        <Card className="mb-4" id="sms">
          <h2>SMS provider</h2>
          <p className="muted">
            {channel
              ? `Connected: ${channel.provider === "SMS_NET_BD" ? "sms.net.bd" : "Test provider"}${channel.keyHint ? ` · key ending ${channel.keyHint}` : ""}${channel.senderId ? ` · sender ${channel.senderId}` : ""}.`
              : "No provider yet. Create an account with a BTRC-listed provider, then paste its API key here."}
          </p>
          {channel?.lastTest ? (
            <p className={channel.lastTest.ok ? "form-ok" : "form-error"}>Last test: {channel.lastTest.ok ? "passed" : "failed"}. {channel.lastTest.detail}</p>
          ) : null}
          <ActionForm action={saveChannelAction} submitLabel="Save channel">
            <label>Provider
              <Select name="provider" defaultValue={channel?.provider ?? "SMS_NET_BD"}>
                <option value="SMS_NET_BD">sms.net.bd</option>
                {showFake ? <option value="FAKE">Test provider (sends nothing)</option> : null}
              </Select>
            </label>
            <label>Sender ID (approved masking name, optional)<Input name="senderId" defaultValue={channel?.senderId ?? ""} maxLength={20} autoComplete="off" /></label>
            <label>API key<Input name="apiKey" type="password" autoComplete="off" placeholder={channel?.keyHint ? "Leave blank to keep the saved key" : "Paste the key from your provider panel"} /></label>
            <p className="form-hint">The key is encrypted before it is stored and is never shown again.</p>
          </ActionForm>
          <ActionForm action={setAlertLocaleAction} submitLabel="Save language">
            <label>Alert language
              <Select name="locale" defaultValue={locale}><option value="en">English</option><option value="bn">বাংলা (Bangla, up to 70 characters per SMS segment)</option></Select>
            </label>
          </ActionForm>
          {channel ? (
            <ActionForm action={testChannelAction} submitLabel="Send test SMS">
              <label>Your mobile number<Input name="phone" inputMode="tel" placeholder="01XXXXXXXXX" required /></label>
            </ActionForm>
          ) : null}
        </Card>
      ) : (
        <Card className="mb-4"><p className="muted">Ask the school owner or administrator to connect an SMS provider.</p></Card>
      )}
    </>
  );
}
