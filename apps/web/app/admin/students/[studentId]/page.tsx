import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getStudentProfile, listCurrentSections } from "@/server/students";
import { addGuardianAction, enrollStudentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({ params }: { params: { studentId: string } }) {
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "student:read")) {
    return <section className="panel"><p className="muted">Your role cannot view students.</p></section>;
  }
  await connectDb();
  const [profile, sections] = await Promise.all([getStudentProfile(actor.institutionId, params.studentId), listCurrentSections(actor.institutionId)]);
  if (!profile) {
    return <section className="panel"><h2>Student not found</h2><Link className="text-link" href="/admin/students">← Back to students</Link></section>;
  }
  const { student, guardians, enrollments } = profile;
  const canWrite = can(actor.role, "student:write");
  const sectionLabel = new Map(sections.map((s) => [s.id, s.label]));

  return (
    <>
      <PageHeading title={`${student.firstName} ${student.lastName}`} description={`Student ID ${student.studentNumber} · ${student.status.toLowerCase()}`} />
      <section className="panel">
        <h2>Details</h2>
        <p className="small">Date of birth: {student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().slice(0, 10) : "—"}</p>
        <p className="small">Current section: {student.sectionId ? sectionLabel.get(String(student.sectionId)) ?? "Previous year" : "Not enrolled"}</p>
        {canWrite && sections.length ? (
          <ActionForm action={enrollStudentAction} submitLabel="Save section">
            <input type="hidden" name="studentId" value={String(student._id)} />
            <label>Enroll / transfer to<select name="sectionId" required defaultValue={student.sectionId ? String(student.sectionId) : ""}>
              <option value="" disabled>Choose…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select></label>
          </ActionForm>
        ) : null}
      </section>

      <section className="panel">
        <h2>Guardians</h2>
        {guardians.length ? (
          <div className="table-scroll"><table><thead><tr><th>Name</th><th>Relationship</th><th>Mobile</th></tr></thead><tbody>
            {guardians.map((g) => {
              const link = g.studentLinks.find((l) => String(l.studentId) === String(student._id));
              return <tr key={String(g._id)}><td>{g.fullName}{link?.isPrimary ? <span className="badge"> primary</span> : null}</td><td>{link?.relationship}</td><td>{g.phone ?? "—"}</td></tr>;
            })}
          </tbody></table></div>
        ) : <p className="empty-state">No guardian linked yet.</p>}
        {canWrite ? (
          <ActionForm action={addGuardianAction} submitLabel="Link guardian">
            <input type="hidden" name="studentId" value={String(student._id)} />
            <label>Guardian name<input name="guardianName" required maxLength={100} /></label>
            <label>Mobile<input name="guardianPhone" required inputMode="tel" placeholder="01XXXXXXXXX" /></label>
            <label>Relationship<input name="guardianRelationship" maxLength={30} placeholder="Mother" /></label>
          </ActionForm>
        ) : null}
      </section>

      <section className="panel">
        <h2>Enrollment history</h2>
        {enrollments.length ? (
          <ul className="plain-list">{enrollments.map((e) => <li key={String(e._id)}>{e.startsOn} — {sectionLabel.get(String(e.sectionId)) ?? "Earlier section"} ({e.status.toLowerCase()})</li>)}</ul>
        ) : <p className="muted small">No enrollments yet.</p>}
        <Link className="text-link" href="/admin/students">← Back to students</Link>
      </section>
    </>
  );
}
