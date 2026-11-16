import { PageHeading } from '@/components/admin/page-heading';

export default function StudentsPage() {
  return (
    <>
      <PageHeading title="Students" description="Student directory, enrollment, and profile management." />
      <section className="panel">
        <div className="panel-heading"><h2>Student directory</h2><span className="badge">Starter view</span></div>
        <p className="muted">Connect this page to the student service to search, enroll, and manage student records.</p>
        <div className="table-scroll"><table><thead><tr><th>Student</th><th>Student ID</th><th>Class / section</th><th>Status</th></tr></thead>
          <tbody><tr><td colSpan={4} className="empty-state">No student records are connected yet.</td></tr></tbody>
        </table></div>
      </section>
    </>
  );
}
