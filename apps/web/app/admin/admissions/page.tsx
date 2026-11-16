import { PageHeading } from '@/components/admin/page-heading';

export default function AdmissionsPage() {
  return <><PageHeading title="Admissions" description="Review applications and convert accepted applicants into student records." /><section className="panel"><span className="badge">Foundation planned</span><h2>Admission review queue</h2><p className="muted">The next admissions slice will add draft applications, document checklists, review decisions, and a duplicate-safe enrolment conversion workflow.</p><p className="small muted">Do not upload applicant or child data until authentication, tenant authorization, and private file storage are connected.</p></section></>;
}
