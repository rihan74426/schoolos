import Link from 'next/link';
import { PageHeading } from '@/components/admin/page-heading';

export default function StudentDetailPage({ params }: { params: { studentId: string } }) {
  return (
    <>
      <PageHeading title="Student profile" description={`Record: ${params.studentId}`} />
      <section className="panel">
        <h2>Student details</h2>
        <p className="muted">Student profile data will appear here when the student service is connected.</p>
        <Link className="text-link" href="/admin/students">← Back to students</Link>
      </section>
    </>
  );
}
