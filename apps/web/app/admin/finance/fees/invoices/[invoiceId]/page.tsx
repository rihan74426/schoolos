import Link from "next/link";
import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { todayInDhaka } from "@/server/dates";
import { getInvoiceDetail } from "@/server/invoices";
import { applyAdjustmentAction, recordPaymentAction, reversePaymentAction, voidInvoiceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: { invoiceId: string } }) {
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "fees:read")) return <section className="panel"><p className="muted">Your role cannot view fees.</p></section>;
  const d = await getInvoiceDetail(actor, params.invoiceId);
  if (!d) return <><PageHeading title="Invoice" description="" /><section className="panel"><p className="form-error">Invoice not found.</p></section></>;
  const { invoice: inv, summary: s, currency: c } = d;
  const money = (n: number) => formatMinor(n, c);
  const open = inv.status === "OPEN";
  return (
    <>
      <PageHeading title={`Invoice ${inv.number}`} description={`${d.student.name} (${d.student.number}) · ${inv.period} · due ${inv.dueDate}`} />
      <p><Link href="/admin/finance/fees/invoices">← All invoices</Link></p>
      <section className="panel">
        <h2>{inv.status === "VOID" ? "Void" : inv.status === "PAID" ? "Paid" : s.overdue ? "Overdue" : "Open"}</h2>
        {inv.voidReason ? <p className="muted">Voided: {inv.voidReason}</p> : null}
        <ul>{inv.lines.map((l) => <li key={l.title}>{l.title}: {money(l.amountMinor)}</li>)}</ul>
        <p>Subtotal {money(inv.subtotalMinor)}{inv.discountMinor ? ` · Discount −${money(inv.discountMinor)}` : ""} · Late fee {money(s.lateDueMinor)}</p>
        <p><strong>Total {money(s.totalMinor)} · Paid {money(inv.paidMinor)} · Balance {money(s.balanceMinor)}</strong></p>
        {inv.settledOn ? <p className="muted">Settled on {inv.settledOn}.</p> : null}
      </section>
      {open && can(actor.role, "fees:write") ? (
        <section className="panel">
          <h2>Record payment</h2>
          <ActionForm action={recordPaymentAction} submitLabel="Record payment">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Amount (taka)<input name="amount" inputMode="decimal" required defaultValue={(s.balanceMinor / 100).toFixed(2)} /></label>
            <label>Method<select name="method"><option value="CASH">Cash</option><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option><option value="BANK">Bank</option><option value="OTHER">Other</option></select></label>
            <label>Reference (transaction id, optional)<input name="reference" maxLength={60} /></label>
            <label>Received on<input name="paidOn" type="date" required defaultValue={todayInDhaka()} max={todayInDhaka()} /></label>
          </ActionForm>
        </section>
      ) : null}
      {open && can(actor.role, "fees:waive") ? (
        <section className="panel">
          <h2>Discount or remit late fee</h2>
          <p className="muted">Discounts are capped at {d.scholarshipCapPercent}% of the invoice. A reason is required and recorded.</p>
          <ActionForm action={applyAdjustmentAction} submitLabel="Apply">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Type<select name="kind"><option value="LATE_FEE_REMIT">Remit late fee</option><option value="DISCOUNT">Discount</option></select></label>
            <label>Amount (taka)<input name="amount" inputMode="decimal" required /></label>
            <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </section>
      ) : null}
      {open && inv.paidMinor === 0 && can(actor.role, "fees:reverse") ? (
        <section className="panel">
          <h2>Void invoice</h2>
          <p className="muted">For an invoice issued by mistake. Nothing has been paid. A reason is required and recorded.</p>
          <ActionForm action={voidInvoiceAction} submitLabel="Void invoice">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </section>
      ) : null}
      <section className="panel">
        <h2>Payments</h2>
        {d.payments.length ? <ul>{d.payments.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/finance/fees/receipts/${p.id}`}>{p.receiptNumber}</Link> · {p.kind === "REVERSAL" ? `Reversal −${money(-p.amountMinor)}: ${p.reason ?? ""}` : money(p.amountMinor)} · {p.method} · {p.paidOn}{p.reference ? ` · ${p.reference}` : ""}{p.reversed ? " · reversed" : ""}
            {p.kind === "PAYMENT" && !p.reversed && inv.status !== "VOID" && can(actor.role, "fees:reverse") ? (
              <ActionForm action={reversePaymentAction} submitLabel="Reverse payment">
                <input type="hidden" name="paymentId" value={p.id} />
                <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
              </ActionForm>
            ) : null}
          </li>
        ))}</ul> : <p className="muted">No payments yet.</p>}
        {inv.adjustments.length ? <><h3>Adjustments</h3><ul>{inv.adjustments.map((a, i) => <li key={i}>{a.kind === "DISCOUNT" ? "Discount" : "Late fee remitted"} {money(a.amountMinor)}: {a.reason}</li>)}</ul></> : null}
      </section>
    </>
  );
}
