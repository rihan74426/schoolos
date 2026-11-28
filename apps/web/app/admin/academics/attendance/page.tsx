import { connectDb } from "@schoolos/db";
import { can } from "@schoolos/core";
import { PageHeading } from "@/components/admin/page-heading";
import { RosterClient } from "@/components/admin/roster-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { resolveActiveMembership } from "@/server/auth";
import { attendanceSections, getRoster } from "@/server/attendance";
import { todayInDhaka } from "@/server/dates";

export const dynamic = "force-dynamic";

export default async function AttendancePage(props: { searchParams: Promise<{ section?: string; date?: string }> }) {
  const searchParams = await props.searchParams;
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Attendance" description="Take daily attendance for your sections." />;
  if (!can(actor.role, "attendance:submit")) {
    return <>{heading}<Card className="mb-4"><p className="muted">Your role cannot take attendance.</p></Card></>;
  }

  const today = todayInDhaka();
  const date = searchParams.date && searchParams.date <= today ? searchParams.date : today;
  const sections = await attendanceSections(actor);
  const sectionId = searchParams.section ?? (sections.length === 1 ? sections[0].id : "");
  const roster = sectionId ? await getRoster(actor, sectionId, date) : null;

  return (
    <>
      {heading}
      <Card className="mb-4">
        {sections.length === 0 ? (
          <p className="m-0 text-sm text-fg-muted">No sections yet. Ask an administrator to assign you to a section.</p>
        ) : (
          <form className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end" method="get">
            <label className="grid gap-1 text-sm font-medium text-fg">Section
              <Select name="section" defaultValue={sectionId}>
                <option value="">Choose…</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-fg">Date<Input type="date" name="date" defaultValue={date} max={today} /></label>
            <Button type="submit">Open</Button>
          </form>
        )}
      </Card>
      {sectionId && !roster ? <Card><p className="m-0 text-sm text-err" role="alert">That section or date is not available to you.</p></Card> : null}
      {roster ? (
        <Card>
          <RosterClient
            key={`${sectionId}-${date}-${roster.session?.submittedAt ?? "new"}`}
            sectionId={sectionId}
            date={date}
            students={roster.students}
            requireFullRoster={roster.requireFullRoster}
            submittedAt={roster.session?.submittedAt ?? null}
            canCorrect={roster.session?.canCorrect ?? true}
          />
        </Card>
      ) : null}
    </>
  );
}
