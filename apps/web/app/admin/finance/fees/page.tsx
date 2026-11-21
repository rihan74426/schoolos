import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
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
    return <>{heading}<section className="panel"><p className="muted">Your role cannot view fees.</p></section></>;
  }
  const doc = await getInstitutionPolicy(actor.institutionId);
  const fees = (doc?.policy as { fees: { currency: string; lateFee: LateFee; scholarshipCapPercent: number } } | undefined)?.fees;
  if (!doc || !fees) return <>{heading}<section className="panel"><p className="form-error">Policy not found. Finish setup first.</p></section></>;
  const late = fees.lateFee;
  const canConfigure = can(actor.role, "fees:configure");

  return (
    <>
      {heading}
      <section className="panel" id="rules">
        <h2>Late fee and scholarship rules</h2>
        <p className="muted">{describe(late, fees.currency)} Scholarships and waivers are capped at {fees.scholarshipCapPercent}% of an invoice.</p>
        {canConfigure ? (
          <ActionForm action={updateFeeRulesAction} submitLabel="Save fee rules">
            <input type="hidden" name="version" value={doc.version} />
            <label>Late fee
              <select name="lateMode" defaultValue={late.mode}>
                <option value="NONE">None</option>
                <option value="FLAT">Flat amount</option>
                <option value="PERCENT_PER_DAY">Percent per late day</option>
              </select>
            </label>
            <label>Amount (taka for flat, percent for per-day)
              <input name="lateAmount" inputMode="decimal" defaultValue={late.mode === "FLAT" ? (late.flatMinor / 100).toFixed(2) : late.mode === "PERCENT_PER_DAY" ? String(late.percent) : ""} />
            </label>
            <label>Grace days<input name="graceDays" inputMode="numeric" defaultValue={late.mode === "NONE" ? 0 : late.graceDays} /></label>
            <label>Cap percent (per-day only)<input name="capPercent" inputMode="numeric" defaultValue={late.mode === "PERCENT_PER_DAY" ? late.capPercent : 100} /></label>
            <label>Scholarship cap percent<input name="scholarshipCapPercent" inputMode="numeric" defaultValue={fees.scholarshipCapPercent} /></label>
            <p className="form-hint">Applies to invoices from now on. Changes are audited with before and after.</p>
          </ActionForm>
        ) : <p className="form-hint">Only the owner, administrator, principal or vice principal can change these rules.</p>}
      </section>
    </>
  );
}
