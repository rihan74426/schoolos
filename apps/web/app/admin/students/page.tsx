import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listCurrentSections, listStudents } from "@/server/students";
import { createStudentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: { q?: string; section?: string; status?: string; page?: string } }) {
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "student:read")) {
    return <section className="panel"><p className="muted">Your role cannot view students.</p></section>;
  }
  await connectDb();
  const canWrite = can(actor.role, "student:write");
  const q = searchParams.q ?? "";
  const [list, sections] = await Promise.all([
    listStudents(actor, { q, sectionId: searchParams.section, status: searchParams.status, page: Number(searchParams.page) || 1 }),
    listCurrentSections(actor),
  ]);
  const sectionLabel = new Map(sections.map((s) => [s.id, s.label]));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const link = (page: number) => `/admin/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(searchParams.section ? { section: searchParams.section } : {}), ...(searchParams.status ? { status: searchParams.status } : {}), page: String(page) })}`;

  return (
    <>
      <PageHeading title="Students" description="Student directory, enrollment, and profile management." />
      <section className="panel">
        <div className="panel-heading"><h2>Directory</h2><span className="badge">{list.total} students</span></div>
        <form method="get" className="form-grid">
          <label>Search name or ID<input name="q" defaultValue={q} maxLength={60} placeholder="Name or student ID" /></label>
          <label>Class / section
            <select name="section" defaultValue={searchParams.section ?? ""}>
              <option value="">All</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={searchParams.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option><option value="WITHDRAWN">Withdrawn</option><option value="all">All</option>
            </select>
          </label>
          <button className="button-link" type="submit">Search</button>
        </form>
        <div className="table-scroll"><table>
          <thead><tr><th>Student</th><th>ID</th><th>Class / section</th><th>Status</th></tr></thead>
          <tbody>
            {list.rows.length ? list.rows.map((s) => (
              <tr key={String(s._id)}>
                <td><Link className="text-link" href={`/admin/students/${String(s._id)}`}>{`${s.firstName} ${s.lastName}`.trim()}</Link></td>
                <td>{s.studentNumber}</td>
                <td>{s.sectionId ? sectionLabel.get(String(s.sectionId)) ?? "—" : "Not enrolled"}</td>
                <td>{s.status.toLowerCase()}</td>
              </tr>
            )) : <tr><td colSpan={4} className="empty-state">{q || searchParams.section ? "No students match." : "No students yet. Add one or import a CSV."}</td></tr>}
          </tbody>
        </table></div>
        {pages > 1 ? (
          <p className="muted small">
            Page {list.page} of {pages} ·{" "}
            {list.page > 1 ? <Link className="text-link" href={link(list.page - 1)}>Previous</Link> : null}{" "}
            {list.page < pages ? <Link className="text-link" href={link(list.page + 1)}>Next</Link> : null}
          </p>
        ) : null}
      </section>

      {canWrite ? (
        <section className="panel">
          <div className="panel-heading"><h2>Add a student</h2><Link className="text-link" href="/admin/students/import">Import CSV →</Link></div>
          <ActionForm action={createStudentAction} submitLabel="Add student">
            <label>Student ID<input name="studentNumber" required maxLength={30} /></label>
            <label>Class / section<select name="sectionId" defaultValue=""><option value="">Enroll later</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>First name<input name="firstName" required maxLength={60} /></label>
            <label>Family name (optional)<input name="lastName" maxLength={60} /></label>
            <label>Date of birth<input type="date" name="dateOfBirth" /></label>
            <label>Guardian name (optional)<input name="guardianName" maxLength={100} /></label>
            <label>Guardian mobile<input name="guardianPhone" inputMode="tel" placeholder="01XXXXXXXXX" /></label>
            <label>Relationship<input name="guardianRelationship" maxLength={30} placeholder="Father" /></label>
          </ActionForm>
          {sections.length === 0 ? <p className="form-hint">No current-year sections yet. Create them in Settings to enroll students.</p> : null}
        </section>
      ) : null}
    </>
  );
}
