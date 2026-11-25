import { buttonVariants } from "@/components/ui/button";
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
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line border-s-4 border-s-brand bg-surface p-4 shadow-card sm:p-5">
          <div className="min-w-0">
            <p className="m-0 mb-1 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">Getting started</p>
            <h2 className="m-0 mb-1 text-base font-semibold text-fg">Set up your institution</h2>
            <p className="m-0 text-sm text-fg-muted">Next: {progress.next.title.toLowerCase()}.</p>
          </div>
          <Link className={buttonVariants({ className: "w-full sm:w-auto" })} href={progress.next.href}>Continue setup</Link>
        </section>
      ) : null}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold text-fg">Setup checklist</h2>
          <Badge>{progress.completed} of {progress.total} complete</Badge>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress.completed} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Setup progress">
          <div className="h-full rounded-full bg-grad transition-[width] duration-300 ease-brand" style={{ width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%` }} />
        </div>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {progress.steps.map((step, index) => (
            <li key={step.key}>
              <Link href={step.href} className="flex min-h-14 items-center gap-3.5 rounded-card border border-line bg-surface p-3.5 shadow-card transition duration-200 ease-brand hover:border-brand motion-safe:hover:-translate-y-px">
                <span aria-hidden="true" className={step.done ? "grid size-8 flex-none place-items-center rounded-full bg-ok text-sm font-bold text-white" : "grid size-8 flex-none place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand"}>{step.done ? "✓" : index + 1}</span>
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-sm text-fg">{step.title}</strong>
                  <small className="text-xs leading-normal text-fg-muted">{step.description}</small>
                </span>
                <span aria-hidden="true" className="ms-auto text-fg-muted rtl:-scale-x-100">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="m-0 mb-3 text-lg font-semibold text-fg">Core modules</h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 xs:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <li key={module.title}>
              <Link href={module.href} className="relative grid min-h-24 content-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition duration-200 ease-brand hover:border-brand motion-safe:hover:-translate-y-0.5">
                <strong className="text-sm text-fg">{module.title}</strong>
                <Badge tone={module.live ? "ok" : "muted"} className="w-fit">{module.live ? "Live" : "Coming soon"}</Badge>
                <span aria-hidden="true" className="absolute end-4 top-3.5 text-fg-muted">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
