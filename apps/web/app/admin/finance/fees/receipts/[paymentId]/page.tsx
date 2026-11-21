import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { resolveActiveMembership } from "@/server/auth";
import { getReceipt } from "@/server/invoices";
import { Institution } from "@schoolos/db";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: { paymentId: string } }) {
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "fees:read")) return <section className="panel"><p className="muted">Your role cannot view fees.</p></section>;
  const r = await getReceipt(actor, params.paymentId);
  if (!r) return <section className="panel"><p className="form-error">Receipt not found.</p></section>;
  const school = (await Institution.findOne({ _id: actor.institutionId }).select("name").lean()) as { name: string } | null;
  const money = (n: number) => formatMinor(n, r.currency);
  return (
    <section className="panel receipt">
      <h1>{school?.name ?? "School"}</h1>
      <h2>Fee receipt {r.receipt.receiptNumber}</h2>
      <p>Date: {r.receipt.paidOn}</p>
      <p>Student: {r.student.name} ({r.student.number})</p>
      <p>Invoice: {r.invoice.number} · {r.invoice.period}</p>
      <p><strong>Amount received: {money(r.receipt.amountMinor)}</strong> by {r.receipt.method}{r.receipt.reference ? ` (${r.receipt.reference})` : ""}</p>
      <p>Balance on invoice: {money(r.summary.balanceMinor)}</p>
      <p className="muted">This is a computer-generated receipt.</p>
    </section>
  );
}
