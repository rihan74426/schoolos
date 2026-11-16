import type { ReactNode } from 'react';
import Link from 'next/link';

const navigation = [
  { href: '/admin/dashboard', label: 'Overview', icon: '⌂' },
  { href: '/admin/admissions', label: 'Admissions', icon: '↗' },
  { href: '/admin/students', label: 'Students', icon: '♙' },
  { href: '/admin/academics/attendance', label: 'Attendance', icon: '✓' },
  { href: '/admin/academics/schedule', label: 'Timetable', icon: '▦' },
  { href: '/admin/finance/fees', label: 'Fees', icon: '$' },
  { href: '/admin/exams', label: 'Exams & results', icon: '▤' },
  { href: '/admin/communications', label: 'Notices', icon: '✉' },
  { href: '/admin/settings', label: 'Institution setup', icon: '⚙' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link className="brand" href="/admin/dashboard"><span className="brand-mark">S</span><span>SchoolOS<small>ADMIN WORKSPACE</small></span></Link>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-caption">SCHOOL OPERATIONS</p>
          {navigation.map((item) => <Link className="nav-link" href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="sidebar-footer"><span className="avatar">A</span><span>School administrator<small>Demo workspace</small></span></div>
      </aside>
      <div className="admin-main">
        <header className="topbar"><span className="mobile-brand">SchoolOS</span><span className="topbar-school">Institution workspace</span><span className="topbar-user">Admin preview</span></header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
