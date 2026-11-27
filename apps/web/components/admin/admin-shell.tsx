import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { Institution } from "@schoolos/db";
import { can } from "@schoolos/core";
import { locales } from "@schoolos/i18n";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MobileNav } from "./mobile-nav";
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
  { href: "/admin/settings", label: "institutionSetup", icon: "⚙", permission: "structure:read" },
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

  const roleLabel = activeMembership?.role.replace(/_/g, " ") ?? "";
  const linkClass = "text-sm font-semibold text-brand";

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[72px] flex-none flex-col bg-side px-2 pb-4 pt-5 text-side-text md:flex lg:w-[248px] lg:px-3.5 print:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-3 px-2 pb-6 text-[17px] font-bold md:max-lg:justify-center">
          <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-[10px] bg-grad text-white shadow-[0_4px_14px_color-mix(in_srgb,var(--brand)_40%,transparent)]">S</span>
          <span className="md:max-lg:sr-only">
            SchoolOS
            <small className="mt-0.5 block text-xs font-normal tracking-[0.12em] text-side-muted">ADMIN WORKSPACE</small>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <p className="m-0 px-3 pb-1.5 pt-2.5 text-xs font-bold tracking-[0.12em] text-side-muted md:max-lg:sr-only">{messages.schoolOperations}</p>
          {visibleNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-side-line px-2 pt-3.5 text-xs md:max-lg:justify-center">
          <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-side-hover font-semibold">
            {(institutionName ?? "S").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 md:max-lg:sr-only">
            <span className="block truncate">{institutionName ?? "SchoolOS"}</span>
            <small className="block text-xs tracking-[0.08em] text-side-muted">{roleLabel}</small>
          </span>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center justify-end gap-x-4 gap-y-2 border-b border-line bg-surface/85 px-4 py-2 text-xs text-fg-muted backdrop-blur md:px-8 print:hidden">
          <span className="me-auto font-bold text-fg md:hidden">SchoolOS</span>
          <span className="hidden max-w-[40ch] truncate sm:inline">{institutionName ?? messages.institutionWorkspace}</span>
          {memberships.length > 1 && activeMembership ? (
            <form action={setActiveSchoolAction} className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor="active-school-picker">{messages.switchInstitution}</label>
              <Select id="active-school-picker" name="institutionId" defaultValue={String(activeMembership.institutionId)} className="min-h-9 w-auto max-w-44 py-1 text-sm">
                {memberships.map((membership) => (
                  <option key={String(membership.institutionId)} value={String(membership.institutionId)}>
                    {institutions.find((item) => String(item._id) === String(membership.institutionId))?.name ?? String(membership.institutionId)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" size="sm">{messages.switchInstitution}</Button>
            </form>
          ) : memberships.length > 1 ? (
            <Link href="/admin/select-school" className={linkClass}>{messages.chooseInstitution}</Link>
          ) : null}
          {memberships.length === 0 ? <Link href="/onboarding" className={linkClass}>{messages.finishSetup}</Link> : null}
          <form action={setThemeAction}>
            <input type="hidden" name="theme" value={nextTheme} />
            <Button type="submit" variant="ghost" size="icon" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}>
              {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
            </Button>
          </form>
          <span className="font-semibold text-fg">{activeMembership?.role ?? messages.setupRequired}</span>
        </header>
        <main className="p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] motion-safe:animate-page-in sm:p-6 md:pb-8 lg:p-8">{children}</main>
      </div>
      <MobileNav items={visibleNav} moreLabel={messages.more} />
    </div>
  );
}
