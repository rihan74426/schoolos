import { Notice } from "@/components/ui/notice";
import { inlineForm, plainList } from "@/lib/form-classes";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getExamDetail } from "@/server/exams";
import { listCorrections } from "@/server/results";
import { openExamAction, publishExamAction, setPassOverrideAction, syncPapersAction, updateAssessmentAction, updateExamRulesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExamPage(props: { params: Promise<{ examId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "exams:read")) return <Card className="mb-4"><p className="muted">Your role cannot view exams.</p></Card>;
  const d = await getExamDetail(actor, params.examId);
  if (!d) return <><PageHeading title="Exam" description="" /><Card className="mb-4"><Notice tone="error">Exam not found.</Notice></Card></>;
  const { exam } = d;
  const draft = exam.status === "DRAFT";
  const published = exam.status === "PUBLISHED";
  const canWrite = can(actor.role, "exams:write");
  const canPublish = can(actor.role, "exams:publish");
  const corrections = published && can(actor.role, "exams:approve") ? await listCorrections(actor, exam.id) : [];
  return (
    <>
      <PageHeading title={exam.name} description={`${exam.term ? `${exam.term} · ` : ""}Status: ${exam.status.toLowerCase()}${exam.resultVersion > 1 ? ` · result version ${exam.resultVersion}` : ""}`} />
      <p><Link href="/admin/exams">← All exams</Link>{published ? <> · <Link href={`/admin/exams/${exam.id}/results`}>Results and report cards</Link></> : null}</p>

      {draft && canWrite ? (
        <Card className="mb-4">
          <h2>Open for marks entry</h2>
          <p className="muted small">Check the papers below first. After opening, full marks cannot change and teachers can enter marks.</p>
          <ActionForm action={openExamAction} submitLabel="Open exam"><input type="hidden" name="examId" value={exam.id} /></ActionForm>
        </Card>
      ) : null}

      <Card className="mb-4">
        <h2>Papers</h2>
        {canWrite && !published ? (
          <>
            <p className="muted small">Added a section or subject after setting up this exam? Sync adds the missing papers. Existing papers and marks are not touched.</p>
            <ActionForm action={syncPapersAction} submitLabel="Sync papers"><input type="hidden" name="examId" value={exam.id} /></ActionForm>
          </>
        ) : null}
        <div className="table-scroll"><table><thead><tr><th>Section</th><th>Subject</th><th>Full marks</th><th>Date</th><th>Sheet</th><th /></tr></thead><tbody>
          {d.papers.map((p) => (
            <tr key={p.id}>
              <td>{p.section}</td><td>{p.subject}{p.isCore ? " ★" : ""}</td>
              <td>{draft && canWrite ? (
                <ActionForm action={updateAssessmentAction} submitLabel="Save" className={inlineForm}>
                  <input type="hidden" name="assessmentId" value={p.id} />
                  <Input name="maxMarks" type="number" min={1} max={1000} defaultValue={p.maxMarks} aria-label="Full marks" />
                  <Input name="date" type="date" defaultValue={p.date ?? ""} aria-label="Exam date" />
                </ActionForm>) : p.maxMarks}</td>
              <td>{draft && canWrite ? "" : p.date ?? "—"}</td>
              <td>{p.sheetStatus ? `${p.sheetStatus.toLowerCase()} (${p.entered})` : "—"}</td>
              <td>{p.sheetStatus ? <Link href={`/admin/exams/sheets/${p.id}`}>View</Link> : null}</td>
            </tr>
          ))}
        </tbody></table></div>
        <p className="muted small">★ core subject</p>
      </Card>

      {canPublish && !published ? (
        <Card className="mb-4">
          <h2>Pass rule</h2>
          <p className="muted small">Default: a student who fails one subject fails the exam. The exam controller may choose core subjects only, or pass a named student below with a reason.</p>
          <ActionForm action={updateExamRulesAction} submitLabel="Save rule">
            <input type="hidden" name="examId" value={exam.id} />
            <label>Rule<Select name="passRule" defaultValue={exam.passRule}><option value="ALL_SUBJECTS">Pass every subject</option><option value="CORE_ONLY">Pass core subjects only</option></Select></label>
          </ActionForm>
          {!draft ? (<>
            <h3>Pass a student by decision</h3>
            {d.overrides.length ? <ul className={plainList}>{d.overrides.map((o) => <li key={o.studentId}>{o.student}: {o.reason}
              <ActionForm action={setPassOverrideAction} submitLabel="Remove" className={inlineForm}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="studentId" value={o.studentId} /><input type="hidden" name="remove" value="1" /><input type="hidden" name="reason" value="Removing the earlier decision" /></ActionForm></li>)}</ul> : null}
            <ActionForm action={setPassOverrideAction} submitLabel="Pass this student">
              <input type="hidden" name="examId" value={exam.id} />
              <label>Student<Select name="studentId" required>{d.students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></label>
              <label>Reason (10+ characters)<Textarea name="reason" rows={2} required minLength={10} maxLength={300} /></label>
            </ActionForm>
          </>) : null}
        </Card>
      ) : null}

      {canPublish && exam.status === "APPROVED" ? (
        <Card className="mb-4">
          <h2>Publish results</h2>
          <p className="muted small">Every sheet is approved. Publishing freezes the marks, grading scheme and results. Later changes need a reason and an approved correction.</p>
          <ActionForm action={publishExamAction} submitLabel="Publish results"><input type="hidden" name="examId" value={exam.id} /></ActionForm>
        </Card>
      ) : null}

      {corrections.length ? <Notice tone="hint">{corrections.length} correction(s) waiting. <Link href="/admin/exams/approvals">Review</Link></Notice> : null}
    </>
  );
}
