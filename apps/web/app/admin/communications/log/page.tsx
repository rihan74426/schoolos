import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

export default async function DeliveryLogPage({ searchParams }: { searchParams: { page?: string } }) {
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "notices:send")) {
    return <><PageHeading title="Delivery log" description="Message delivery status." /><section className="panel"><p className="muted">Your role cannot view the delivery log.</p></section></>;
  }
  const page = Math.max(1, Number(searchParams.page) || 1);
  const log = await listNotifications(actor, page);
  const pages = Math.max(1, Math.ceil(log.total / log.pageSize));
  return (
    <>
      <PageHeading title="Delivery log" description="Every SMS the system queued, with its status. Failed messages show the provider's reason." />
      <section className="panel">
        {log.rows.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>Time</th><th>Student</th><th>To</th><th>Status</th><th>Tries</th><th>Note</th></tr></thead>
            <tbody>{log.rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
                <td>{r.student}</td><td>{r.to}</td>
                <td><span className="badge">{r.status}</span></td><td>{r.attempts}</td><td>{r.error || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="empty-state">No messages yet. Absence alerts appear here after attendance is submitted.</p>}
        {pages > 1 ? <p className="small muted">Page {page} of {pages} {page > 1 ? <Link href={`?page=${page - 1}`}>Previous</Link> : null} {page < pages ? <Link href={`?page=${page + 1}`}>Next</Link> : null}</p> : null}
      </section>
    </>
  );
}
