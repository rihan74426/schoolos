import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getStudentProfile, listCurrentSections } from "@/server/students";
import { addGuardianAction, setGuardianConsentAction, enrollStudentAction, setStudentStatusAction, updateStudentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({ params }: { params: { studentId: string } }) {
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "student:read")) {
    return <section className="panel"><p className="muted">Your role cannot view students.</p></section>;
  }
  await connectDb();
  const [profile, sections] = await Promise.all([getStudentProfile(actor, params.studentId), listCurrentSections(actor)]);
  if (!profile) {
    return <section className="panel"><h2>Student not found</h2><Link className="text-link" href="/admin/students">← Back to students</Link></section>;
  }
  const { student, guardians, enrollments } = profile;
  const canWrite = can(actor.role, "student:write");
  const sectionLabel = new Map(sections.map((s) => [s.id, s.label]));

  return (
    <>
      <PageHeading title={`${student.firstName} ${student.lastName}`.trim()} description={`Student ID ${student.studentNumber} · ${student.status.toLowerCase()}`} />
      <section className="panel">
        <h2>Details</h2>
        <p className="small">Date of birth: {student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().slice(0, 10) : "—"}</p>
        <p className="small">Current section: {student.sectionId ? sectionLabel.get(String(student.sectionId)) ?? "Previous year" : "Not enrolled"}</p>
        {canWrite && student.status === "ACTIVE" && sections.length ? (
          <ActionForm action={enrollStudentAction} submitLabel="Save section">
            <input type="hidden" name="studentId" value={String(student._id)} />
            <label>Enroll / transfer to<select name="sectionId" required defaultValue={student.sectionId ? String(student.sectionId) : ""}>
              <option value="" disabled>Choose…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select></label>
          </ActionForm>
        ) : null}
      </section>

      {canWrite ? (
        <section className="panel">
          <h2>Edit student</h2>
          <ActionForm action={updateStudentAction} submitLabel="Save changes">
            <input type="hidden" name="studentId" value={String(student._id)} />
            <label>First name<input name="firstName" required maxLength={60} defaultValue={student.firstName} /></label>
            <label>Family name (optional)<input name="lastName" maxLength={60} defaultValue={student.lastName} /></label>
            <label>Date of birth<input type="date" name="dateOfBirth" defaultValue={student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().slice(0, 10) : ""} /></label>
          </ActionForm>
          <ActionForm action={setStudentStatusAction} submitLabel={student.status === "ACTIVE" ? "Withdraw student" : "Reactivate student"} className="inline-form">
            <input type="hidden" name="studentId" value={String(student._id)} />
            <input type="hidden" name="status" value={student.status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE"} />
          </ActionForm>
          {student.status === "ACTIVE" ? <p className="form-hint">Withdrawing removes the student from class rosters. Records and history are kept.</p> : <p className="form-hint">Reactivating does not restore a class. Enroll the student again afterwards.</p>}
        </section>
      ) : null}

      <section className="panel">
        <h2>Guardians</h2>
        {guardians.length ? (
          <div className="table-scroll"><table><thead><tr><th>Name</th><th>Relationship</th><th>Mobile</th><th>SMS alerts</th></tr></thead><tbody>
            {guardians.map((g) => {
              const link = g.studentLinks.find((l) => String(l.studentId) === String(student._id));
              return <tr key={String(g._id)}><td>{g.fullName}{link?.isPrimary ? <span className="badge"> primary</span> : null}</td><td>{link?.relationship}</td><td>{g.phone ?? "—"}</td><td>{g.consent?.sms ? <span className="badge">on</span> : <span className="muted">off</span>}{canWrite && g.phone ? (
                <ActionForm action={setGuardianConsentAction} submitLabel={g.consent?.sms ? "Turn off" : "Guardian agreed: turn on"} className="inline-form">
                  <input type="hidden" name="studentId" value={String(student._id)} /><input type="hidden" name="guardianId" value={String(g._id)} /><input type="hidden" name="sms" value={g.consent?.sms ? "false" : "true"} />
                </ActionForm>) : null}</td></tr>;
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
