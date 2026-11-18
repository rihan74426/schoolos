import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { Institution } from "@schoolos/db";
import { locales } from "@schoolos/i18n";
import { getActiveMemberships } from "@/server/auth";
import { setActiveSchoolAction } from "@/app/admin/actions";

const navigation = [
  { href: "/admin/dashboard", label: "overview", icon: "⌂" },
  { href: "/admin/admissions", label: "admissions", icon: "↗" },
  { href: "/admin/students", label: "students", icon: "♙" },
  { href: "/admin/academics/attendance", label: "attendance", icon: "✓" },
  { href: "/admin/academics/schedule", label: "timetable", icon: "▦" },
  { href: "/admin/finance/fees", label: "fees", icon: "$" },
  { href: "/admin/exams", label: "exams", icon: "▤" },
  { href: "/admin/communications", label: "notices", icon: "✉" },
  { href: "/admin/settings", label: "institutionSetup", icon: "⚙" },
];

export async function AdminShell({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  const memberships = userId ? await getActiveMemberships(userId) : [];
  const cookieStore = await cookies();
  const activeSchoolId = cookieStore.get("active-school")?.value;
  const requestedLocale = cookieStore.get("schoolos-locale")?.value;
  const locale =
    requestedLocale &&
    Object.prototype.hasOwnProperty.call(locales, requestedLocale)
      ? (requestedLocale as keyof typeof locales)
      : "en";
  const messages = locales[locale];
  const activeMembership =
    memberships.find(
      (membership) => String(membership.institutionId) === activeSchoolId,
    ) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const institutions =
    memberships.length > 0
      ? ((await Institution.find({
          _id: { $in: memberships.map(({ institutionId }) => institutionId) },
        })
          .select("name")
          .lean()) as unknown as Array<{ _id: unknown; name: string }>)
      : [];
  const institutionName = institutions.find(
    (candidate) =>
      String(candidate._id) === String(activeMembership?.institutionId),
  )?.name;

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link className="brand" href="/admin/dashboard">
          <span className="brand-mark">S</span>
          <span>
            SchoolOS<small>ADMIN WORKSPACE</small>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-caption">{messages.schoolOperations}</p>
          {navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              <span aria-hidden="true">{item.icon}</span>
              {messages[item.label as keyof typeof locales.en]}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">
            {(institutionName ?? "S").slice(0, 1).toUpperCase()}
          </span>
          <span>
            {institutionName ?? "SchoolOS"}
            <small>{activeMembership?.role.replace(/_/g, " ") ?? ""}</small>
          </span>
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <span className="mobile-brand">SchoolOS</span>
          <span className="topbar-school">
            {institutionName ?? messages.institutionWorkspace}
          </span>
          {memberships.length > 1 && activeMembership ? (
            <form action={setActiveSchoolAction} className="school-switcher">
              <label className="visually-hidden" htmlFor="active-school-picker">
                {messages.switchInstitution}
              </label>
              <select
                id="active-school-picker"
                name="institutionId"
                defaultValue={String(activeMembership.institutionId)}
              >
                {memberships.map((membership) => (
                  <option
                    key={String(membership.institutionId)}
                    value={String(membership.institutionId)}
                  >
                    {institutions.find(
                      (item) =>
                        String(item._id) === String(membership.institutionId),
                    )?.name ?? String(membership.institutionId)}
                  </option>
                ))}
              </select>
              <button type="submit">{messages.switchInstitution}</button>
            </form>
          ) : memberships.length > 1 ? (
            <Link href="/admin/select-school" className="text-link">
              {messages.chooseInstitution}
            </Link>
          ) : null}
          {memberships.length === 0 ? (
            <Link href="/onboarding" className="text-link">
              {messages.finishSetup}
            </Link>
          ) : null}
          <span className="topbar-user">
            {activeMembership?.role ?? messages.setupRequired}
          </span>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
