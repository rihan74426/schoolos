import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-card">
        <p className="eyebrow">School operations</p>
        <h1>SchoolOS</h1>
        <p>Manage academics, students, attendance, fees, and hostel operations.</p>
        <Link className="button-link" href="/admin/dashboard">Open admin portal</Link>
      </div>
    </main>
  );
}
