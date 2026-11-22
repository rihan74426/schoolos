import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { approvalQueue } from "@/server/exams";
import { listCorrections } from "@/server/results";
import { approveSheetAction, decideCorrectionAction, returnSheetAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Approvals" description="Review submitted mark sheets and result corrections." />;
  if (!can(actor.role, "exams:approve")) return <>{heading}<section className="panel"><p className="muted">Your role cannot approve marks.</p></section></>;
  const [queue, corrections] = await Promise.all([approvalQueue(actor.institutionId), listCorrections(actor)]);
  const canDecide = can(actor.role, "exams:publish");
  const val = (v: { status: string; marks?: number | null }) => (v.status === "PRESENT" ? String(v.marks) : v.status.toLowerCase());
  return (
    <>
      {heading}
      <p><Link href="/admin/exams">← Exams</Link></p>
      <section className="panel">
        <h2>Mark sheets waiting</h2>
        {queue.length ? queue.map((q) => (
          <div key={q.assessmentId} className="list-row">
            <strong>{q.exam} · {q.subject} · {q.section}</strong> <span className="muted small">{q.entered} students · <Link href={`/admin/exams/sheets/${q.assessmentId}`}>Review marks</Link></span>
            <ActionForm action={approveSheetAction} submitLabel="Approve"><input type="hidden" name="assessmentId" value={q.assessmentId} /></ActionForm>
            <ActionForm action={returnSheetAction} submitLabel="Send back">
              <input type="hidden" name="assessmentId" value={q.assessmentId} />
              <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
            </ActionForm>
          </div>
        )) : <p className="empty-state">Nothing waiting.</p>}
      </section>
      <section className="panel">
        <h2>Corrections to published results</h2>
        {corrections.length ? corrections.map((c) => (
          <div key={c.id} className="list-row">
            <strong>{c.exam} · {c.subject} · {c.student}</strong>
            <p>{val(c.before)} → {val(c.after)} (full marks {c.maxMarks}). Reason: {c.reason}</p>
            {canDecide ? (<>
              <ActionForm action={decideCorrectionAction} submitLabel="Approve and publish new version"><input type="hidden" name="correctionId" value={c.id} /><input type="hidden" name="decision" value="approve" /></ActionForm>
              <ActionForm action={decideCorrectionAction} submitLabel="Reject">
                <input type="hidden" name="correctionId" value={c.id} /><input type="hidden" name="decision" value="reject" />
                <label>Reason for rejecting (10+ characters)<textarea name="note" rows={2} required minLength={10} maxLength={300} /></label>
              </ActionForm>
            </>) : <p className="muted small">Leadership decides corrections.</p>}
          </div>
        )) : <p className="empty-state">No corrections waiting.</p>}
      </section>
    </>
  );
}
