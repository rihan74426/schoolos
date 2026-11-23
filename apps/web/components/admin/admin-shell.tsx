import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { Institution } from "@schoolos/db";
import { can } from "@schoolos/core";
import { locales } from "@schoolos/i18n";
import { NavLink } from "./nav-link";
import { getActiveMemberships } from "@/server/auth";
import { setActiveSchoolAction, setThemeAction } from "@/app/admin/actions";

const navigation = [
  { href: "/admin/dashboard", label: "overview", icon: "⌂", permission: null },
  { href: "/admin/admissions", label: "admissions", icon: "↗", permission: "student:write" },
  { href: "/admin/students", label: "students", icon: "♙", permission: "student:read" },
  { href: "/admin/academics/attendance", label: "attendance", icon: "✓", permission: "attendance:submit" },
  { href: "/admin/academics/schedule", label: "timetable", icon: "▦", permission: "structure:read" },
  { href: "/admin/finance/fees", label: "fees", icon: "$", permission: "fees:read" },
  { href: "/admin/exams", label: "exams", icon: "▤", permission: "exams:read" },
  { href: "/admin/communications", label: "notices", icon: "✉", permission: "notices:send" },
  { href: "/admin/settings", label: "institutionSetup", icon: "⚙", permission: "policy:read" },
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
  const themeCookie = cookieStore.get("schoolos-theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const activeMembership =
    memberships.find(
      (membership) => String(membership.institutionId) === activeSchoolId,
    ) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const role = activeMembership?.role;
  const visibleNav = navigation
    .filter((item) => !item.permission || (role !== undefined && can(role, item.permission)))
    .map((item) => ({ href: item.href, icon: item.icon, label: messages[item.label as keyof typeof locales.en] }));
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
          {visibleNav.map((item) => (
            <NavLink key={item.href} {...item} />
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
          <form action={setThemeAction} className="school-switcher">
            <input type="hidden" name="theme" value={nextTheme} />
            <button type="submit" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}>
              {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
            </button>
          </form>
          <span className="topbar-user">
            {activeMembership?.role ?? messages.setupRequired}
          </span>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="tabbar" aria-label="Quick navigation">
        {visibleNav.slice(0, 5).map((item) => (
          <NavLink key={item.href} {...item} variant="tab" />
        ))}
      </nav>
    </div>
  );
}
