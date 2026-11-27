import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/card";
import { can, formatMinor } from "@schoolos/core";
import { resolveActiveMembership } from "@/server/auth";
import { getReceipt } from "@/server/invoices";
import { connectDb, Institution } from "@schoolos/db";

export const dynamic = "force-dynamic";

export default async function ReceiptPage(props: { params: Promise<{ paymentId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "fees:read")) return <Card className="mb-4"><p className="muted">Your role cannot view fees.</p></Card>;
  const r = await getReceipt(actor, params.paymentId);
  if (!r) return <Card className="mb-4"><Notice tone="error">Receipt not found.</Notice></Card>;
  const school = (await Institution.findOne({ _id: actor.institutionId }).select("name").lean()) as { name: string } | null;
  const money = (n: number) => formatMinor(n, r.currency);
  return (
    <section className="panel receipt">
      <h1>{school?.name ?? "School"}</h1>
      <h2>{r.receipt.kind === "REVERSAL" ? "Payment reversal" : "Fee receipt"} {r.receipt.receiptNumber}</h2>
      {r.receipt.reversed ? <Notice tone="error"><strong>REVERSED. This receipt is no longer valid.</strong></Notice> : null}
      {r.receipt.kind === "REVERSAL" ? <p>Reason: {r.receipt.reason}</p> : null}
      <p>Date: {r.receipt.paidOn}</p>
      <p>Student: {r.student.name} ({r.student.number})</p>
      <p>Invoice: {r.invoice.number} · {r.invoice.period}</p>
      <p><strong>{r.receipt.kind === "REVERSAL" ? "Amount returned" : "Amount received"}: {money(Math.abs(r.receipt.amountMinor))}</strong> by {r.receipt.method}{r.receipt.reference ? ` (${r.receipt.reference})` : ""}</p>
      <p>Balance on invoice: {money(r.summary.balanceMinor)}</p>
      <p className="muted">This is a computer-generated receipt.</p>
    </section>
  );
}
