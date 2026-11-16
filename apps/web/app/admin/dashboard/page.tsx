import Link from 'next/link';
import { PageHeading } from '@/components/admin/page-heading';

const metrics = [
  { label: 'Students enrolled', value: '—', note: 'Connect your school data to see totals' },
  { label: 'Attendance today', value: '—', note: 'Daily attendance summary' },
  { label: 'Fees collected', value: '—', note: 'Current billing period' },
  { label: 'Open tasks', value: '—', note: 'Items needing staff attention' },
];

const shortcuts = [
  { href: '/admin/students', label: 'Manage students', description: 'Browse student records and enrollment details.' },
  { href: '/admin/academics/attendance', label: 'Take attendance', description: 'Review class attendance workflows.' },
  { href: '/admin/finance/fees', label: 'Review fees', description: 'Manage fee schedules and payment records.' },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeading title="Dashboard" description="A high-level view of your school operations." />
      <section className="metric-grid" aria-label="School overview">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <p className="muted">{metric.label}</p>
            <p className="metric-value">{metric.value}</p>
            <p className="small muted">{metric.note}</p>
          </article>
        ))}
      </section>
      <section className="content-section">
        <h2>Quick access</h2>
        <div className="shortcut-grid">
          {shortcuts.map((shortcut) => (
            <Link className="shortcut-card" href={shortcut.href} key={shortcut.href}>
              <strong>{shortcut.label}</strong>
              <span>{shortcut.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
