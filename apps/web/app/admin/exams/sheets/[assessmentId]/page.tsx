import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { MarksEntry } from "@/components/admin/marks-entry";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getMarkSheet } from "@/server/exams";
import { requestCorrectionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SheetPage(props: { params: Promise<{ assessmentId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  const m = await getMarkSheet(actor, params.assessmentId);
  if (!m) return <><PageHeading title="Marks" description="" /><Card className="mb-4"><p className="form-error">Sheet not found, or you are not assigned to this subject and section.</p></Card></>;
  return (
    <>
      <PageHeading title={`${m.paper.subject} · ${m.paper.section}`} description={`${m.exam.name} · full marks ${m.paper.maxMarks}${m.paper.date ? ` · ${m.paper.date}` : ""} · sheet ${m.sheet.status.toLowerCase()}`} />
      <p><Link href="/admin/exams">← Exams</Link></p>
      {m.sheet.returnReason ? <p className="form-error" role="alert">Sent back: {m.sheet.returnReason}</p> : null}
      {m.exam.status === "DRAFT" ? <Card className="mb-4"><p className="muted">This exam is still a draft. Marks open when it is opened.</p></Card> : (
        <Card className="mb-4">
          <MarksEntry assessmentId={m.paper.id} maxMarks={m.paper.maxMarks} students={m.students.map((s) => ({ ...s, status: s.status as "PRESENT" | "ABSENT" | "EXEMPT" | null }))} canEdit={m.canEdit} />
          {!m.canEdit && !m.canCorrect ? <p className="muted small">This sheet is locked ({m.sheet.status.toLowerCase()}).</p> : null}
        </Card>
      )}
      {m.canCorrect ? (
        <Card className="mb-4">
          <h2>Request a correction</h2>
          <p className="muted small">Results are published. A change needs a reason and approval from leadership, and creates a new result version.</p>
          <ActionForm action={requestCorrectionAction} submitLabel="Send for approval">
            <input type="hidden" name="assessmentId" value={m.paper.id} />
            <label>Student<Select name="studentId" required>{m.students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.number}) · now {s.status === "PRESENT" ? s.marks : s.status?.toLowerCase() ?? "—"}</option>)}</Select></label>
            <label>New value<Select name="status"><option value="PRESENT">Marks</option><option value="ABSENT">Absent</option><option value="EXEMPT">Exempt</option></Select></label>
            <label>Marks (if marks)<Input name="marks" inputMode="decimal" /></label>
            <label>Reason (10+ characters)<Textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
