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
  if (!can(actor.role, "fees:read")) return <>{heading}<section className="panel"><p className="muted">Your role cannot view fees.</p></section></>;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const status = ["OPEN", "PAID", "OVERDUE"].includes(searchParams.status ?? "") ? searchParams.status : "";
  const list = await listInvoices(actor, { status, q: searchParams.q, page });
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const qs = (p: number) => `?${new URLSearchParams({ ...(status ? { status } : {}), ...(searchParams.q ? { q: searchParams.q } : {}), page: String(p) })}`;
  return (
    <>
      {heading}
      <section className="panel">
        <form method="get" className="roster-picker">
          <label>Search student<input name="q" defaultValue={searchParams.q ?? ""} placeholder="Name or number" /></label>
          <label>Status<select name="status" defaultValue={status}><option value="">All</option><option value="OPEN">Open</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></label>
          <button className="button-link" type="submit">Filter</button>
        </form>
      </section>
      <section className="panel">
        {list.rows.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>Invoice</th><th>Student</th><th>Period</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>{list.rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/finance/fees/invoices/${r.id}`}>{r.number}</Link></td>
                <td>{r.student.name} <small className="muted">{r.student.number}</small></td>
                <td>{r.period}</td><td>{r.dueDate}</td>
                <td>{formatMinor(r.totalMinor, list.currency)}</td><td>{formatMinor(r.balanceMinor, list.currency)}</td>
                <td><span className="badge">{r.overdue ? "OVERDUE" : r.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="empty-state">No invoices match.</p>}
        {pages > 1 ? <p className="small muted">Page {page} of {pages} {page > 1 ? <Link href={qs(page - 1)}>Previous</Link> : null} {page < pages ? <Link href={qs(page + 1)}>Next</Link> : null}</p> : null}
      </section>
    </>
  );
}
