import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveActiveMembership } from "@/server/auth";
import { listExams, mySheets } from "@/server/exams";
import { createExamAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Exams & results" description="Set up exams, enter marks, approve, then publish. A published result never changes silently." />;
  if (!can(actor.role, "exams:read")) return <>{heading}<Card className="mb-4"><p className="muted">Your role cannot view exams.</p></Card></>;
  const [{ exams, years, levels }, mine] = await Promise.all([listExams(actor), mySheets(actor)]);
  return (
    <>
      {heading}
      {mine.length ? (
        <Card className="mb-4">
          <h2>Marks to enter</h2>
          <ul className="plain-list">{mine.map((m) => <li key={m.assessmentId}><Link href={`/admin/exams/sheets/${m.assessmentId}`}>{m.exam} · {m.subject} · {m.section}</Link>{m.returnReason ? <span className="form-error"> Sent back: {m.returnReason}</span> : null} <span className="muted small">{m.entered} entered</span></li>)}</ul>
        </Card>
      ) : null}
      {can(actor.role, "exams:approve") ? <p><Link href="/admin/exams/approvals">Approval queue →</Link></p> : null}
      <Card className="mb-4">
        <h2>Exams</h2>
        {exams.length ? (
          <div className="table-scroll"><table className="table-cards"><thead><tr><th>Exam</th><th>Class</th><th>Year</th><th>Status</th><th /></tr></thead><tbody>
            {exams.map((e) => <tr key={e.id}><td data-label="Exam"><strong>{e.name}</strong>{e.term ? ` · ${e.term}` : ""}</td><td data-label="Class">{e.level}</td><td data-label="Year">{e.year}</td><td data-label="Status"><StatusBadge status={e.status} />{e.resultVersion > 1 ? ` v${e.resultVersion}` : ""}</td><td data-label=""><Link className="font-semibold text-brand" href={`/admin/exams/${e.id}`}>Open →</Link></td></tr>)}
          </tbody></table></div>
        ) : <EmptyState title="No exams yet">Create one below to start entering marks.</EmptyState>}
      </Card>
      {can(actor.role, "exams:write") ? (
        <Card className="mb-4">
          <h2>New exam</h2>
          <p className="muted small">Creates one paper for every section and subject of the class. Map subjects to the class in Settings first.</p>
          <ActionForm action={createExamAction} submitLabel="Create exam">
            <label>Name<input name="name" required maxLength={60} placeholder="Half-yearly 2026" /></label>
            <label>Term (optional)<input name="term" maxLength={40} placeholder="Term 2" /></label>
            <label>Academic year<select name="academicYearId" required>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
            <label>Class<select name="gradeLevelId" required>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>Pass rule<select name="passRule"><option value="ALL_SUBJECTS">Pass every subject (default)</option><option value="CORE_ONLY">Pass core subjects only</option></select></label>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
