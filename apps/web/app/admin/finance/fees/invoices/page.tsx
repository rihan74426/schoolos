import { Pager } from "@/components/admin/pager";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { can, formatMinor } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listInvoices } from "@/server/invoices";

export const dynamic = "force-dynamic";

export default async function InvoicesPage(props: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Invoices" description="Bills, payments and arrears." />;
  if (!can(actor.role, "fees:read")) return <>{heading}<Card className="mb-4"><p className="muted">Your role cannot view fees.</p></Card></>;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const status = ["OPEN", "PAID", "OVERDUE"].includes(searchParams.status ?? "") ? searchParams.status : "";
  const list = await listInvoices(actor, { status, q: searchParams.q, page });
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const qs = (p: number) => `?${new URLSearchParams({ ...(status ? { status } : {}), ...(searchParams.q ? { q: searchParams.q } : {}), page: String(p) })}`;
  return (
    <>
      {heading}
      <Card className="mb-4">
        <form method="get" className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium text-fg">Search student<Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Name or number" /></label>
          <label className="grid gap-1 text-sm font-medium text-fg">Status<Select name="status" defaultValue={status}><option value="">All</option><option value="OPEN">Open</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></Select></label>
          <Button type="submit">Filter</Button>
        </form>
      </Card>
      <Card>
        {list.rows.length ? (
          <div className="table-scroll"><table className="table-cards">
            <thead><tr><th>Invoice</th><th>Student</th><th>Period</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>{list.rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Invoice"><Link className="font-semibold text-brand" href={`/admin/finance/fees/invoices/${r.id}`}>{r.number}</Link></td>
                <td data-label="Student">{r.student.name} <small className="text-fg-muted">{r.student.number}</small></td>
                <td data-label="Period">{r.period}</td><td data-label="Due">{r.dueDate}</td>
                <td data-label="Total">{formatMinor(r.totalMinor, list.currency)}</td><td data-label="Balance">{formatMinor(r.balanceMinor, list.currency)}</td>
                <td data-label="Status"><Badge tone={r.overdue ? "err" : r.status === "PAID" ? "ok" : "brand"}>{r.overdue ? "OVERDUE" : r.status}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No invoices match">Change the filter or generate invoices from a fee plan.</EmptyState>}
        <Pager page={page} pages={pages} href={qs} />
      </Card>
    </>
  );
}
