import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

export default async function DeliveryLogPage(props: { searchParams: Promise<{ page?: string }> }) {
  const searchParams = await props.searchParams;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "notices:send")) {
    return <><PageHeading title="Delivery log" description="Message delivery status." /><Card><p className="m-0 text-sm text-fg-muted">Your role cannot view the delivery log.</p></Card></>;
  }
  const page = Math.max(1, Number(searchParams.page) || 1);
  const log = await listNotifications(actor, page);
  const pages = Math.max(1, Math.ceil(log.total / log.pageSize));
  return (
    <>
      <PageHeading title="Delivery log" description="Every SMS the system queued, with its status. Failed messages show the provider's reason." />
      <Card>
        {log.rows.length ? (
          <div className="table-scroll"><table className="table-cards">
            <thead><tr><th>Time</th><th>Student</th><th>To</th><th>Status</th><th>Tries</th><th>Note</th></tr></thead>
            <tbody>{log.rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Time">{new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
                <td data-label="Student">{r.student}</td><td data-label="To">{r.to}</td>
                <td data-label="Status"><Badge tone={r.status === "FAILED" ? "err" : r.status === "DELIVERED" || r.status === "SENT" ? "ok" : "brand"}>{r.status}</Badge></td><td data-label="Tries">{r.attempts}</td><td data-label="Note">{r.error || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No messages yet">Absence alerts appear here after attendance is submitted.</EmptyState>}
        <Pager page={page} pages={pages} href={(n) => `?page=${n}`} />
      </Card>
    </>
  );
}
