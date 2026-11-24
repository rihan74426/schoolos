import Link from "next/link";
import { redirect } from "next/navigation";
import { STAFF_PROFILE_ROLES } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { KpiCard } from "@/components/admin/kpi-card";
import { PageHeading } from "@/components/admin/page-heading";
import { Badge } from "@/components/ui/badge";
import { getKpis } from "@/server/dashboard";
import { resolveActiveMembership } from "@/server/auth";
import { getSetupProgress } from "@/server/setup";
import { getStaffProfile } from "@/server/staff";

export const dynamic = "force-dynamic";

const modules = [
  { title: "Students", href: "/admin/students", live: true },
  { title: "Attendance", href: "/admin/academics/attendance", live: true },
  { title: "Fees", href: "/admin/finance/fees", live: true },
  { title: "Exams and results", href: "/admin/exams", live: true },
  { title: "Notices and SMS", href: "/admin/communications", live: true },
  { title: "Admissions", href: "/admin/admissions", live: false },
  { title: "Timetable", href: "/admin/academics/schedule", live: false },
];

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date())) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  // Invited staff finish their profile before using the dashboard.
  if (STAFF_PROFILE_ROLES.includes(actor.role) && !(await getStaffProfile(actor.institutionId, actor.membershipId))) {
    redirect("/admin/welcome");
  }
  const progress = await getSetupProgress(actor.institutionId);
  const kpis = await getKpis(actor);

  return (
    <>
      <PageHeading title={greeting()} description="Your school at a glance." />
      {kpis.length ? (
        <section aria-label="Key numbers" className="mb-6 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
        </section>
      ) : null}
      {progress.next ? (
        <section className="panel dashboard-callout">
          <div>
            <p className="eyebrow">GETTING STARTED</p>
            <h2>Set up your institution</h2>
            <p className="muted">Next: {progress.next.title.toLowerCase()}.</p>
          </div>
          <Link className="button-link" href={progress.next.href}>Continue setup</Link>
        </section>
      ) : null}
      <section className="content-section">
        <div className="section-title-row">
          <div><p className="eyebrow">FOUNDATION</p><h2>Setup checklist</h2></div>
          <span className="badge">{progress.completed} of {progress.total} complete</span>
        </div>
        <div className="setup-list">
          {progress.steps.map((step, index) => (
            <Link className="setup-item" href={step.href} key={step.key}>
              <span className="step-number">{step.done ? "✓" : index + 1}</span>
              <span><strong>{step.title}</strong><small>{step.description}</small></span>
              <span className="setup-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="content-section">
        <div className="section-title-row"><div><p className="eyebrow">WORKSPACE</p><h2>Core modules</h2></div></div>
        <div className="module-grid">{modules.map((module) => <Link className="module-card" href={module.href} key={module.title}><strong>{module.title}</strong><Badge tone={module.live ? "ok" : "muted"} className="w-fit">{module.live ? "Live" : "Coming soon"}</Badge><span className="module-arrow" aria-hidden="true">↗</span></Link>)}</div>
      </section>
    </>
  );
}
