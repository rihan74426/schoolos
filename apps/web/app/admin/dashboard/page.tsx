import Link from "next/link";
import { redirect } from "next/navigation";
import { STAFF_PROFILE_ROLES } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { sectionsMissingAttendance } from "@/server/attendance";
import { todayInDhaka } from "@/server/dates";
import { getSetupProgress } from "@/server/setup";
import { getStaffProfile } from "@/server/staff";

export const dynamic = "force-dynamic";

const modules = [
  { title: "Admissions", href: "/admin/admissions", status: "Planned next" },
  { title: "Students", href: "/admin/students", status: "Foundation" },
  { title: "Attendance", href: "/admin/academics/attendance", status: "Foundation" },
  { title: "Timetable", href: "/admin/academics/schedule", status: "Foundation" },
  { title: "Fees", href: "/admin/finance/fees", status: "Planned" },
  { title: "Exams and results", href: "/admin/exams", status: "Planned" },
];

export default async function DashboardPage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  // Invited staff finish their profile before using the dashboard.
  if (STAFF_PROFILE_ROLES.includes(actor.role) && !(await getStaffProfile(actor.institutionId, actor.membershipId))) {
    redirect("/admin/welcome");
  }
  const progress = await getSetupProgress(actor.institutionId);
  const today = todayInDhaka();
  const missing = await sectionsMissingAttendance(actor, today);

  return (
    <>
      <PageHeading title="Good morning" description="Your school operations overview. Complete setup before bringing real records into the system." />
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
      {missing.length ? (
        <section className="panel dashboard-callout">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2>Attendance not taken</h2>
            <p className="muted">{missing.map((s) => s.label).join(", ")}</p>
          </div>
          <Link className="button-link" href={`/admin/academics/attendance?section=${missing[0].id}`}>Take attendance</Link>
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
        <div className="module-grid">{modules.map((module) => <Link className="module-card" href={module.href} key={module.title}><strong>{module.title}</strong><span className="small muted">{module.status}</span><span className="module-arrow" aria-hidden="true">↗</span></Link>)}</div>
      </section>
    </>
  );
}
