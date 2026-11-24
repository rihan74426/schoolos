import Link from "next/link";
import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { resolveActiveMembership } from "@/server/auth";
import { todayInDhaka } from "@/server/dates";
import { getInvoiceDetail } from "@/server/invoices";
import { applyAdjustmentAction, recordPaymentAction, reversePaymentAction, voidInvoiceAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function InvoicePage(props: { params: Promise<{ invoiceId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "fees:read")) return <Card className="mb-4"><p className="muted">Your role cannot view fees.</p></Card>;
  const d = await getInvoiceDetail(actor, params.invoiceId);
  if (!d) return <><PageHeading title="Invoice" description="" /><Card className="mb-4"><p className="form-error">Invoice not found.</p></Card></>;
  const { invoice: inv, summary: s, currency: c } = d;
  const money = (n: number) => formatMinor(n, c);
  const open = inv.status === "OPEN";
  return (
    <>
      <PageHeading title={`Invoice ${inv.number}`} description={`${d.student.name} (${d.student.number}) · ${inv.period} · due ${inv.dueDate}`} />
      <p><Link className="font-semibold text-brand" href="/admin/finance/fees/invoices">← All invoices</Link></p>
      <Card className="mb-4 grid gap-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Summary</CardTitle>
          <Badge tone={inv.status === "VOID" ? "muted" : inv.status === "PAID" ? "ok" : s.overdue ? "err" : "brand"}>{inv.status === "VOID" ? "Void" : inv.status === "PAID" ? "Paid" : s.overdue ? "Overdue" : "Open"}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Total", money(s.totalMinor), "text-fg"], ["Paid", money(inv.paidMinor), "text-ok"], ["Balance", money(s.balanceMinor), s.balanceMinor ? "text-warn" : "text-fg"]].map(([label, value, tone]) => (
            <div key={label} className="rounded-[10px] bg-surface-2 p-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</div>
              <div className={cn("text-sm font-bold sm:text-base", tone)}>{value}</div>
            </div>
          ))}
        </div>
        {inv.voidReason ? <p className="m-0 text-sm text-fg-muted">Voided: {inv.voidReason}</p> : null}
        <ul className="m-0 grid list-none gap-1 p-0 text-sm">
          {inv.lines.map((l) => <li key={l.title} className="flex justify-between gap-3 border-b border-line py-1.5"><span>{l.title}</span><span>{money(l.amountMinor)}</span></li>)}
          {inv.discountMinor ? <li className="flex justify-between gap-3 py-1.5 text-ok"><span>Discount</span><span>−{money(inv.discountMinor)}</span></li> : null}
          <li className="flex justify-between gap-3 py-1.5"><span>Late fee</span><span>{money(s.lateDueMinor)}</span></li>
        </ul>
        {inv.settledOn ? <p className="m-0 text-xs text-fg-muted">Settled on {inv.settledOn}.</p> : null}
      </Card>
      {open && can(actor.role, "fees:write") ? (
        <Card className="mb-4">
          <h2>Record payment</h2>
          <ActionForm action={recordPaymentAction} submitLabel="Record payment">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Amount (taka)<input name="amount" inputMode="decimal" required defaultValue={(s.balanceMinor / 100).toFixed(2)} /></label>
            <label>Method<select name="method"><option value="CASH">Cash</option><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option><option value="BANK">Bank</option><option value="OTHER">Other</option></select></label>
            <label>Reference (transaction id, optional)<input name="reference" maxLength={60} /></label>
            <label>Received on<input name="paidOn" type="date" required defaultValue={todayInDhaka()} max={todayInDhaka()} /></label>
          </ActionForm>
        </Card>
      ) : null}
      {open && can(actor.role, "fees:waive") ? (
        <Card className="mb-4">
          <h2>Discount or remit late fee</h2>
          <p className="muted">Discounts are capped at {d.scholarshipCapPercent}% of the invoice. A reason is required and recorded.</p>
          <ActionForm action={applyAdjustmentAction} submitLabel="Apply">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Type<select name="kind"><option value="LATE_FEE_REMIT">Remit late fee</option><option value="DISCOUNT">Discount</option></select></label>
            <label>Amount (taka)<input name="amount" inputMode="decimal" required /></label>
            <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </Card>
      ) : null}
      {open && inv.paidMinor === 0 && can(actor.role, "fees:reverse") ? (
        <Card className="mb-4">
          <h2>Void invoice</h2>
          <p className="muted">For an invoice issued by mistake. Nothing has been paid. A reason is required and recorded.</p>
          <ActionForm action={voidInvoiceAction} submitLabel="Void invoice">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </Card>
      ) : null}
      <Card className="mb-4">
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
      </Card>
    </>
  );
}
