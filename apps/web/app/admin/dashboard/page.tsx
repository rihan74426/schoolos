import Link from 'next/link';
import { PageHeading } from '@/components/admin/page-heading';

const setupSteps = [
  { title: 'Create the academic year', description: 'Set dates and identify the current session.', href: '/admin/settings' },
  { title: 'Add grades and sections', description: 'Create the class structure for the session.', href: '/admin/settings' },
  { title: 'Add students and guardians', description: 'Import or create institution records after access controls are ready.', href: '/admin/students' },
  { title: 'Start attendance', description: 'Record a class register and review exceptions.', href: '/admin/academics/attendance' },
];

const modules = [
  { title: 'Admissions', href: '/admin/admissions', status: 'Planned next' },
  { title: 'Students', href: '/admin/students', status: 'Foundation' },
  { title: 'Attendance', href: '/admin/academics/attendance', status: 'Foundation' },
  { title: 'Timetable', href: '/admin/academics/schedule', status: 'Foundation' },
  { title: 'Fees', href: '/admin/finance/fees', status: 'Planned' },
  { title: 'Exams and results', href: '/admin/exams', status: 'Planned' },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeading title="Good morning" description="Your school operations overview. Complete setup before bringing real records into the system." />
      <section className="panel dashboard-callout">
        <div><p className="eyebrow">GETTING STARTED</p><h2>Set up your institution</h2><p className="muted">A guided checklist helps establish the academic structure before daily workflows begin.</p></div>
        <Link className="button-link" href="/admin/settings">Continue setup</Link>
      </section>
      <section className="content-section">
        <div className="section-title-row"><div><p className="eyebrow">FOUNDATION</p><h2>Setup checklist</h2></div><span className="badge">0 of 4 complete</span></div>
        <div className="setup-list">{setupSteps.map((step, index) => <Link className="setup-item" href={step.href} key={step.title}><span className="step-number">{index + 1}</span><span><strong>{step.title}</strong><small>{step.description}</small></span><span className="setup-arrow" aria-hidden="true">→</span></Link>)}</div>
      </section>
      <section className="content-section">
        <div className="section-title-row"><div><p className="eyebrow">WORKSPACE</p><h2>Core modules</h2></div></div>
        <div className="module-grid">{modules.map((module) => <Link className="module-card" href={module.href} key={module.title}><strong>{module.title}</strong><span className="small muted">{module.status}</span><span className="module-arrow" aria-hidden="true">↗</span></Link>)}</div>
      </section>
    </>
  );
}
