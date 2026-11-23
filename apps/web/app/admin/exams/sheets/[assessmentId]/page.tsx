import Link from "next/link";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { MarksEntry } from "@/components/admin/marks-entry";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getMarkSheet } from "@/server/exams";
import { requestCorrectionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: { assessmentId: string } }) {
  const actor = await resolveActiveMembership();
  await connectDb();
  const m = await getMarkSheet(actor, params.assessmentId);
  if (!m) return <><PageHeading title="Marks" description="" /><section className="panel"><p className="form-error">Sheet not found, or you are not assigned to this subject and section.</p></section></>;
  return (
    <>
      <PageHeading title={`${m.paper.subject} · ${m.paper.section}`} description={`${m.exam.name} · full marks ${m.paper.maxMarks}${m.paper.date ? ` · ${m.paper.date}` : ""} · sheet ${m.sheet.status.toLowerCase()}`} />
      <p><Link href="/admin/exams">← Exams</Link></p>
      {m.sheet.returnReason ? <p className="form-error" role="alert">Sent back: {m.sheet.returnReason}</p> : null}
      {m.exam.status === "DRAFT" ? <section className="panel"><p className="muted">This exam is still a draft. Marks open when it is opened.</p></section> : (
        <section className="panel">
          <MarksEntry assessmentId={m.paper.id} maxMarks={m.paper.maxMarks} students={m.students.map((s) => ({ ...s, status: s.status as "PRESENT" | "ABSENT" | "EXEMPT" | null }))} canEdit={m.canEdit} />
          {!m.canEdit && !m.canCorrect ? <p className="muted small">This sheet is locked ({m.sheet.status.toLowerCase()}).</p> : null}
        </section>
      )}
      {m.canCorrect ? (
        <section className="panel">
          <h2>Request a correction</h2>
          <p className="muted small">Results are published. A change needs a reason and approval from leadership, and creates a new result version.</p>
          <ActionForm action={requestCorrectionAction} submitLabel="Send for approval">
            <input type="hidden" name="assessmentId" value={m.paper.id} />
            <label>Student<select name="studentId" required>{m.students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.number}) · now {s.status === "PRESENT" ? s.marks : s.status?.toLowerCase() ?? "—"}</option>)}</select></label>
            <label>New value<select name="status"><option value="PRESENT">Marks</option><option value="ABSENT">Absent</option><option value="EXEMPT">Exempt</option></select></label>
            <label>Marks (if marks)<input name="marks" inputMode="decimal" /></label>
            <label>Reason (10+ characters)<textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </section>
      ) : null}
    </>
  );
}
