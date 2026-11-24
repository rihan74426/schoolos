import "server-only";
import { can } from "@schoolos/core";
import { MarkSheet, NotificationJob } from "@schoolos/db";
import type { Actor } from "./auth";
import { sectionsMissingAttendance } from "./attendance";
import { todayInDhaka } from "./dates";
import { collectionSummary } from "./invoices";

export type Kpi = { key: string; label: string; value: string; hint: string; href: string; tone: "ok" | "warn" | "err" | "brand" };

/** Role-aware headline numbers. Each tile appears only if the role may open the page behind it. */
export async function getKpis(actor: Actor): Promise<Kpi[]> {
  const { institutionId, role } = actor;
  const tiles: Array<Promise<Kpi | null>> = [];

  if (can(role, "attendance:submit")) {
    tiles.push(sectionsMissingAttendance(actor, todayInDhaka()).then((missing) => ({
      key: "attendance", label: "Attendance today", value: missing.length ? `${missing.length} pending` : "All taken",
      hint: missing.length ? missing.slice(0, 2).map((s) => s.label).join(", ") : "Every section is marked", href: missing.length ? `/admin/academics/attendance?section=${missing[0].id}` : "/admin/academics/attendance",
      tone: missing.length ? "warn" : "ok",
    } as Kpi)));
  }
  if (can(role, "fees:read")) {
    tiles.push(collectionSummary(actor).then((s) => ({
      key: "overdue", label: "Overdue invoices", value: String(s.overdueCount), hint: s.overdueCount ? "Follow up with guardians" : "Nothing overdue",
      href: "/admin/finance/fees/invoices?status=OVERDUE", tone: s.overdueCount ? "err" : "ok",
    } as Kpi)));
  }
  if (can(role, "exams:approve")) {
    tiles.push(MarkSheet.countDocuments({ institutionId, status: "SUBMITTED" }).then((n: number) => ({
      key: "approvals", label: "Sheets to approve", value: String(n), hint: n ? "Waiting for review" : "Queue is clear", href: "/admin/exams/approvals", tone: n ? "warn" : "ok",
    } as Kpi)));
  }
  if (can(role, "notices:send")) {
    tiles.push(NotificationJob.countDocuments({ institutionId, status: "FAILED" }).then((n: number) => ({
      key: "sms", label: "Failed SMS", value: String(n), hint: n ? "Check the delivery log" : "No failures", href: "/admin/communications/log", tone: n ? "err" : "ok",
    } as Kpi)));
  }
  return (await Promise.all(tiles)).filter((k): k is Kpi => k !== null);
}
