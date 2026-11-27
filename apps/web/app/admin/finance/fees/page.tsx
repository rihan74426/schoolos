import { Notice } from "@/components/ui/notice";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { resolveActiveMembership } from "@/server/auth";
import { collectionSummary } from "@/server/invoices";
import { getInstitutionPolicy } from "@/server/policy";
import { updateFeeRulesAction } from "./actions";

export const dynamic = "force-dynamic";

type LateFee =
  | { mode: "NONE" }
  | { mode: "FLAT"; flatMinor: number; graceDays: number }
  | { mode: "PERCENT_PER_DAY"; percent: number; graceDays: number; capPercent: number };

function describe(lateFee: LateFee, currency: string) {
  if (lateFee.mode === "NONE") return "No late fee. Overdue invoices are only flagged.";
  const grace = lateFee.graceDays ? ` after ${lateFee.graceDays} grace day(s)` : "";
  if (lateFee.mode === "FLAT") return `${formatMinor(lateFee.flatMinor, currency)} once an invoice is overdue${grace}.`;
  return `${lateFee.percent}% of the invoice per late day${grace}, capped at ${lateFee.capPercent}%.`;
}

export default async function FeesPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Fees" description="Fee rules, plans, invoices, payments, and waivers." />;
  if (!can(actor.role, "fees:read")) {
    return <>{heading}<Card className="mb-4"><p className="muted">Your role cannot view fees.</p></Card></>;
  }
  const doc = await getInstitutionPolicy(actor.institutionId);
  const fees = (doc?.policy as { fees: { currency: string; lateFee: LateFee; scholarshipCapPercent: number } } | undefined)?.fees;
  if (!doc || !fees) return <>{heading}<Card className="mb-4"><Notice tone="error">Policy not found. Finish setup first.</Notice></Card></>;
  const late = fees.lateFee;
  const canConfigure = can(actor.role, "fees:configure");
  const sum = await collectionSummary(actor);

  return (
    <>
      {heading}
      <section aria-label="Collection summary" className="mb-4 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
        {[
          ["Billed", formatMinor(sum.billedMinor, sum.currency), `${sum.invoices} invoice(s)`, "text-fg"],
          ["Collected", formatMinor(sum.collectedMinor, sum.currency), "Payments received", "text-ok"],
          ["Outstanding", formatMinor(sum.outstandingMinor, sum.currency), "Still to collect", "text-warn"],
          ["Overdue", formatMinor(sum.overdueMinor, sum.currency), `${sum.overdueCount} invoice(s)`, sum.overdueCount ? "text-err" : "text-fg"],
        ].map(([label, value, hint, tone]) => (
          <div key={label} className="grid gap-1 rounded-card border border-line bg-surface p-4 shadow-card">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</span>
            <span className={cn("text-xl font-bold tracking-tight", tone)}>{value}</span>
            <span className="text-xs text-fg-muted">{hint}</span>
          </div>
        ))}
      </section>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className={buttonVariants()} href="/admin/finance/fees/invoices">Invoices and payments</Link>
        <Link className={buttonVariants({ variant: "secondary" })} href="/admin/finance/fees/plans">Fee plans</Link>
      </div>
      <Card id="rules" className="grid gap-3">
        <CardTitle>Late fee and scholarship rules</CardTitle>
        <p className="muted">{describe(late, fees.currency)} Scholarships and waivers are capped at {fees.scholarshipCapPercent}% of an invoice.</p>
        {canConfigure ? (
          <ActionForm action={updateFeeRulesAction} submitLabel="Save fee rules">
            <input type="hidden" name="version" value={doc.version} />
            <label>Late fee
              <Select name="lateMode" defaultValue={late.mode}>
                <option value="NONE">None</option>
                <option value="FLAT">Flat amount</option>
                <option value="PERCENT_PER_DAY">Percent per late day</option>
              </Select>
            </label>
            <label>Amount (taka for flat, percent for per-day)
              <Input name="lateAmount" inputMode="decimal" defaultValue={late.mode === "FLAT" ? (late.flatMinor / 100).toFixed(2) : late.mode === "PERCENT_PER_DAY" ? String(late.percent) : ""} />
            </label>
            <label>Grace days<Input name="graceDays" inputMode="numeric" defaultValue={late.mode === "NONE" ? 0 : late.graceDays} /></label>
            <label>Cap percent (per-day only)<Input name="capPercent" inputMode="numeric" defaultValue={late.mode === "PERCENT_PER_DAY" ? late.capPercent : 100} /></label>
            <label>Scholarship cap percent<Input name="scholarshipCapPercent" inputMode="numeric" defaultValue={fees.scholarshipCapPercent} /></label>
            <Notice tone="hint">Applies to invoices from now on. Changes are audited with before and after.</Notice>
          </ActionForm>
        ) : <Notice tone="hint">Only the owner, administrator, principal or vice principal can change these rules.</Notice>}
      </Card>
    </>
  );
}
