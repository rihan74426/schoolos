import { connectDb } from "@schoolos/db";
import { can } from "@schoolos/core";
import { PageHeading } from "@/components/admin/page-heading";
import { RosterClient } from "@/components/admin/roster-client";
import { resolveActiveMembership } from "@/server/auth";
import { getRoster } from "@/server/attendance";
import { todayInDhaka } from "@/server/dates";
import { listCurrentSections } from "@/server/students";

export const dynamic = "force-dynamic";

export default async function AttendancePage(props: { searchParams: Promise<{ section?: string; date?: string }> }) {
  const searchParams = await props.searchParams;
  const actor = await resolveActiveMembership();
  await connectDb();
  const heading = <PageHeading title="Attendance" description="Take daily attendance for your sections." />;
  if (!can(actor.role, "attendance:submit")) {
    return <>{heading}<section className="panel"><p className="muted">Your role cannot take attendance.</p></section></>;
  }

  const today = todayInDhaka();
  const date = searchParams.date && searchParams.date <= today ? searchParams.date : today;
  const sections = await listCurrentSections(actor);
  const sectionId = searchParams.section ?? (sections.length === 1 ? sections[0].id : "");
  const roster = sectionId ? await getRoster(actor, sectionId, date) : null;

  return (
    <>
      {heading}
      <section className="panel">
        {sections.length === 0 ? (
          <p className="muted">No sections yet. Ask an administrator to assign you to a section.</p>
        ) : (
          <form className="roster-picker" method="get">
            <label>Section
              <select name="section" defaultValue={sectionId}>
                <option value="">Choose…</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>Date<input type="date" name="date" defaultValue={date} max={today} /></label>
            <button className="button-link" type="submit">Open</button>
          </form>
        )}
      </section>
      {sectionId && !roster ? <section className="panel"><p className="form-error" role="alert">That section or date is not available to you.</p></section> : null}
      {roster ? (
        <section className="panel">
          <RosterClient
            key={`${sectionId}-${date}-${roster.session?.submittedAt ?? "new"}`}
            sectionId={sectionId}
            date={date}
            students={roster.students}
            requireFullRoster={roster.requireFullRoster}
            submittedAt={roster.session?.submittedAt ?? null}
            canCorrect={roster.session?.canCorrect ?? true}
          />
        </section>
      ) : null}
    </>
  );
}
