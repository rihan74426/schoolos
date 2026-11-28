import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { dataTable, inlineForm, mutedSm, plainList, subNav, subNavLink, tableWrap } from "@/lib/form-classes";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { clerkClient } from "@clerk/nextjs/server";
import { can, gradingPresets, invitableRoles } from "@schoolos/core";
import { connectDb, GradingScheme, Staff } from "@schoolos/db";
import { InviteForm } from "@/components/admin/invite-form";
import { listPendingInvitations } from "@/server/invitations";
import { PageHeading } from "@/components/admin/page-heading";
import { ActionForm } from "@/components/admin/action-form";
import { resolveActiveMembership } from "@/server/auth";
import { getInstitutionPolicy } from "@/server/policy";
import { listStructure } from "@/server/structure";
import { listSubjects } from "@/server/subjects";
import {
  assignTeacherAction,
  createSubjectAction,
  mapSubjectAction,
  setSubjectCoreAction,
  unmapSubjectAction,
  createGradeLevelAction,
  createGradingSchemeAction,
  createSectionAction,
  createInviteAction,
  createYearAction,
  revokeInviteAction,
  endAssignmentAction,
  setCurrentYearAction,
  updateRulesAction,
} from "./actions";

export const dynamic = "force-dynamic";

type Policy = {
  attendance: { minimumAttendancePercent: number; flagBelowPercent: number; correctionWindowHours?: number; requireFullRoster?: boolean };
  fees: { lateFee: { mode: string; flatMinor?: number; percent?: number; graceDays?: number; capPercent?: number } };
  gradingSchemeKey: string;
};

// Emails are shown only to roles that manage structure; everyone else sees names or a short id.
async function teacherNames(ids: string[], allowEmail: boolean) {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: ids, limit: 100 });
    for (const u of data) {
      names.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || (allowEmail ? u.primaryEmailAddress?.emailAddress : undefined) || u.id);
    }
  } catch {
    /* fall back to short ids */
  }
  return names;
}

export default async function SettingsPage() {
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "structure:read")) {
    return (
      <>
        <PageHeading title="Settings" description="School profile, academic configuration, and staff access." />
        <Card className="mb-4"><p className="m-0 text-sm text-fg-muted">Your role cannot view settings.</p></Card>
      </>
    );
  }
  await connectDb();
  const canStructure = can(actor.role, "structure:write");
  const canAssign = can(actor.role, "teaching:assign");
  const canPolicy = can(actor.role, "policy:write");
  const canInvite = can(actor.role, "staff:invite");

  const [data, policyDoc, schemes, subjectData] = await Promise.all([
    listStructure(actor.institutionId),
    getInstitutionPolicy(actor.institutionId),
    GradingScheme.find({ institutionId: actor.institutionId, status: "ACTIVE" }).sort({ name: 1 }).lean() as unknown as Promise<Array<{ key: string; name: string; isDefault: boolean }>>,
    listSubjects(actor.institutionId),
  ]);
  const subjectName = new Map(subjectData.subjects.map((x) => [x.id, x.name]));
  const [names, staffRows, invites] = await Promise.all([
    teacherNames(data.teachers.map((t) => t.clerkUserId), canStructure),
    Staff.find({ institutionId: actor.institutionId, membershipId: { $in: data.teachers.map((t) => t._id) } }).lean() as unknown as Promise<Array<{ membershipId: unknown; fullName: string }>>,
    canInvite ? listPendingInvitations(actor.institutionId) : Promise.resolve([]),
  ]);
  const staffName = new Map(staffRows.map((r) => [String(r.membershipId), r.fullName]));
  const levelName = new Map(data.gradeLevels.map((g) => [String(g._id), g.name]));
  const yearName = new Map(data.years.map((y) => [String(y._id), y.name]));
  const sectionLabel = new Map(data.sections.map((s) => [String(s._id), `${levelName.get(String(s.gradeLevelId)) ?? "?"} – ${s.name} (${yearName.get(String(s.academicYearId)) ?? "?"})`]));
  const teacherLabel = new Map(data.teachers.map((t) => [String(t._id), staffName.get(String(t._id)) ?? names.get(t.clerkUserId) ?? `Teacher …${t.clerkUserId.slice(-6)}`]));
  const policy = policyDoc?.policy as Policy | undefined;
  const late = policy?.fees.lateFee;

  return (
    <>
      <PageHeading title="Settings" description="Academic structure, teaching assignments, and your school's rules." />
      <nav className={subNav} aria-label="Settings sections">
        {[["years", "Years"], ["classes", "Classes"], ...(canInvite ? [["staff", "Staff"]] : []), ["subjects", "Subjects"], ["teaching", "Teaching"], ["rules", "Rules"], ["grading", "Grading"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className={subNavLink}>{label}</a>
        ))}
      </nav>

      <Card className="mb-4 scroll-mt-16" id="years">
        <h2>Academic years</h2>
        {data.years.length ? (
          <div className={tableWrap}><table className={dataTable}><thead><tr><th>Name</th><th>Dates</th><th>Status</th>{canStructure ? <th /> : null}</tr></thead><tbody>
            {data.years.map((y) => (
              <tr key={String(y._id)}><td>{y.name}</td><td>{y.startsOn} → {y.endsOn}</td><td>{y.isCurrent ? <Badge>Current</Badge> : "—"}</td>
                {canStructure ? <td>{y.isCurrent ? null : <ActionForm action={setCurrentYearAction} submitLabel="Make current" className={inlineForm}><input type="hidden" name="yearId" value={String(y._id)} /></ActionForm>}</td> : null}</tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No academic year yet. Add one to start." />}
        {canStructure ? (
          <ActionForm action={createYearAction} submitLabel="Add year">
            <label>Name<Input name="name" required maxLength={40} placeholder="2026" /></label>
            <label>Starts<Input type="date" name="startsOn" required /></label>
            <label>Ends<Input type="date" name="endsOn" required /></label>
            <label className="check"><input type="checkbox" name="makeCurrent" /> Make current</label>
          </ActionForm>
        ) : null}
      </Card>

      <Card className="mb-4 scroll-mt-16" id="classes">
        <h2>Classes and sections</h2>
        <p className={mutedSm}>{data.gradeLevels.length ? data.gradeLevels.map((g) => g.name).join(" · ") : "No classes yet."}</p>
        {data.sections.length ? <ul className={plainList}>{data.sections.map((s) => <li key={String(s._id)}>{sectionLabel.get(String(s._id))}</li>)}</ul> : null}
        {canStructure ? (<>
          <ActionForm action={createGradeLevelAction} submitLabel="Add class">
            <label>Class name<Input name="name" required maxLength={60} placeholder="Class 6 / Hifz" /></label>
            <label>Order<Input type="number" name="sortOrder" min={0} defaultValue={data.gradeLevels.length + 1} /></label>
          </ActionForm>
          {data.years.length && data.gradeLevels.length ? (
            <ActionForm action={createSectionAction} submitLabel="Add section">
              <label>Year<Select name="academicYearId" required>{data.years.map((y) => <option key={String(y._id)} value={String(y._id)}>{y.name}</option>)}</Select></label>
              <label>Class<Select name="gradeLevelId" required>{data.gradeLevels.map((g) => <option key={String(g._id)} value={String(g._id)}>{g.name}</option>)}</Select></label>
              <label>Section<Input name="name" required maxLength={40} placeholder="A" /></label>
            </ActionForm>
          ) : <Notice tone="hint">Add an academic year and a class to create sections.</Notice>}
        </>) : null}
      </Card>

      {canInvite ? (
        <Card className="mb-4 scroll-mt-16" id="staff">
          <h2>Invite staff</h2>
          <p className={mutedSm}>Create a link and send it by WhatsApp, Messenger or any app. The person signs up, joins this school with the role you pick, then fills in their profile.</p>
          <InviteForm action={createInviteAction} roles={invitableRoles(actor.role)} />
          {invites.length ? (
            <div className={tableWrap}><table className={dataTable}><thead><tr><th>Role</th><th>Note</th><th>Expires</th><th /></tr></thead><tbody>
              {invites.map((i) => (
                <tr key={String(i._id)}><td>{i.role.replace(/_/g, " ").toLowerCase()}</td><td>{i.inviteeNote ?? "—"}</td><td>{new Date(i.expiresAt).toISOString().slice(0, 10)}</td>
                  <td><ActionForm action={revokeInviteAction} submitLabel="Revoke" className={inlineForm}><input type="hidden" name="invitationId" value={String(i._id)} /></ActionForm></td></tr>
              ))}</tbody></table></div>
          ) : null}
        </Card>
      ) : null}

      <Card className="mb-4 scroll-mt-16" id="subjects">
        <h2>Subjects</h2>
        <p className={mutedSm}>Core subjects decide pass or fail when an exam uses the core-subjects-only rule. By default a student must pass every subject.</p>
        {subjectData.subjects.length ? (
          <div className={tableWrap}><table className={dataTable}><thead><tr><th>Code</th><th>Subject</th><th>Core</th>{canStructure ? <th /> : null}</tr></thead><tbody>
            {subjectData.subjects.map((x) => (
              <tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.isCore ? "Yes" : "No"}</td>
                {canStructure ? <td><ActionForm action={setSubjectCoreAction} submitLabel={x.isCore ? "Make not core" : "Make core"} className={inlineForm}><input type="hidden" name="subjectId" value={x.id} /><input type="hidden" name="isCore" value={x.isCore ? "0" : "1"} /></ActionForm></td> : null}</tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No subjects yet." />}
        {canStructure ? (
          <ActionForm action={createSubjectAction} submitLabel="Add subject">
            <label>Code<Input name="code" required maxLength={12} placeholder="MATH" /></label>
            <label>Name<Input name="name" required maxLength={60} placeholder="Mathematics" /></label>
            <label className="check"><input type="checkbox" name="isCore" /> Core subject</label>
          </ActionForm>
        ) : null}
        <h3 className="mb-2 mt-4 text-sm font-semibold">Subjects per class</h3>
        {subjectData.levels.map((l) => {
          const rows = subjectData.mappings.filter((m) => m.gradeLevelId === l.id);
          return (
            <div key={l.id}>
              <strong className="mt-2 block text-sm">{l.name}</strong>
              {rows.length ? <ul className={plainList}>{rows.map((m) => (
                <li key={m.id}>{subjectName.get(m.subjectId) ?? "?"} · full marks {m.defaultMaxMarks}
                  {canStructure ? <ActionForm action={unmapSubjectAction} submitLabel="Remove" className={inlineForm}><input type="hidden" name="gradeLevelId" value={l.id} /><input type="hidden" name="subjectId" value={m.subjectId} /></ActionForm> : null}</li>
              ))}</ul> : <p className={mutedSm}>No subjects mapped.</p>}
            </div>
          );
        })}
        {canStructure && subjectData.levels.length && subjectData.subjects.length ? (
          <ActionForm action={mapSubjectAction} submitLabel="Add to class">
            <label>Class<Select name="gradeLevelId" required>{subjectData.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></label>
            <label>Subject<Select name="subjectId" required>{subjectData.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
            <label>Full marks<Input name="defaultMaxMarks" type="number" min={1} max={1000} defaultValue={100} /></label>
          </ActionForm>
        ) : null}
      </Card>

      <Card className="mb-4 scroll-mt-16" id="teaching">
        <h2>Teaching assignments</h2>
        <p className={mutedSm}>Class teachers (no subject) take attendance. Subject teachers enter exam marks only for the subject and section they are assigned.</p>
        {data.assignments.length ? (
          <div className={tableWrap}><table className={dataTable}><thead><tr><th>Teacher</th><th>Section</th><th>Subject</th>{canAssign ? <th /> : null}</tr></thead><tbody>
            {data.assignments.map((a) => (
              <tr key={String(a._id)}><td>{teacherLabel.get(String(a.membershipId)) ?? "Unknown"}</td><td>{sectionLabel.get(String(a.sectionId)) ?? "Unknown"}</td><td>{a.subjectId ? subjectName.get(String(a.subjectId)) ?? "Unknown" : "Class teacher"}</td>
                {canAssign ? <td><ActionForm action={endAssignmentAction} submitLabel="End" className={inlineForm}><input type="hidden" name="assignmentId" value={String(a._id)} /></ActionForm></td> : null}</tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No assignments yet." />}
        {canAssign ? (
          data.teachers.length && data.sections.length ? (
            <ActionForm action={assignTeacherAction} submitLabel="Assign">
              <label>Teacher<Select name="membershipId" required>{data.teachers.map((t) => <option key={String(t._id)} value={String(t._id)}>{teacherLabel.get(String(t._id))}</option>)}</Select></label>
              <label>Section<Select name="sectionId" required>{data.sections.map((s) => <option key={String(s._id)} value={String(s._id)}>{sectionLabel.get(String(s._id))}</option>)}</Select></label>
              <label>Subject<Select name="subjectId"><option value="">Class teacher (attendance)</option>{subjectData.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
            </ActionForm>
          ) : <Notice tone="hint">Needs at least one section and one staff member with the Teacher role.</Notice>
        ) : null}
      </Card>

      <Card className="mb-4 scroll-mt-16" id="rules">
        <h2>School rules</h2>
        {policy && policyDoc ? (
          canPolicy ? (
            <ActionForm action={updateRulesAction} submitLabel="Save rules">
              <input type="hidden" name="version" value={policyDoc.version} />
              <label>Default grading scheme<Select name="gradingSchemeKey" defaultValue={policy.gradingSchemeKey}>{schemes.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select></label>
              <label>Minimum attendance %<Input type="number" name="minimumAttendancePercent" min={0} max={100} step="any" defaultValue={policy.attendance.minimumAttendancePercent} required /></label>
              <label>Flag at-risk below %<Input type="number" name="flagBelowPercent" min={0} max={100} step="any" defaultValue={policy.attendance.flagBelowPercent} required /></label>
              <label>Teacher correction window (hours)<Input type="number" name="correctionWindowHours" min={0} max={8760} defaultValue={policy.attendance.correctionWindowHours ?? 48} required /></label>
              <label className="check"><input type="checkbox" name="requireFullRoster" defaultChecked={policy.attendance.requireFullRoster ?? true} /> Require every student to be marked</label>
              <label>Late fee<Select name="lateMode" defaultValue={late?.mode ?? "NONE"}><option value="NONE">None</option><option value="FLAT">Flat amount</option><option value="PERCENT_PER_DAY">Percent per late day</option></Select></label>
              <label>Amount (৳ for flat, % for per-day)<Input type="number" name="lateAmount" min={0} step="any" defaultValue={late?.mode === "FLAT" ? (late.flatMinor ?? 0) / 100 : late?.percent ?? 0} /></label>
              <label>Grace days<Input type="number" name="graceDays" min={0} defaultValue={late?.graceDays ?? 0} /></label>
              <label>Cap % (per-day only)<Input type="number" name="capPercent" min={0} max={100} defaultValue={late?.capPercent ?? 100} /></label>
            </ActionForm>
          ) : <p className="m-0 text-sm text-fg-muted">Only owners and admins can change rules.</p>
        ) : <EmptyState title="No rules saved for this school yet." />}
      </Card>

      <Card className="mb-4 scroll-mt-16" id="grading">
        <h2>Grading schemes</h2>
        <p className={mutedSm}>{schemes.map((s) => s.name + (s.isDefault ? " (default)" : "")).join(" · ") || "None"}. Presets: {Object.values(gradingPresets).map((p) => p.name).join(", ")}.</p>
        {canPolicy ? (
          <ActionForm action={createGradingSchemeAction} submitLabel="Save scheme">
            <label>Scheme name<Input name="name" required maxLength={80} placeholder="Our Dakhil scale" /></label>
            <label>Pass mark %<Input type="number" name="passPercent" min={0} max={100} step="any" required defaultValue={33} /></label>
            <label>Fail label<Input name="failLabel" maxLength={20} defaultValue="F" /></label>
            <label className="wide">Bands, one per line: label, minimum %, optional grade point<Textarea name="bands" rows={6} required defaultValue={"A+ 80 5\nA 70 4\nB 60 3"} /></label>
            <label className="check"><input type="checkbox" name="makeDefault" /> Make default</label>
          </ActionForm>
        ) : null}
      </Card>
    </>
  );
}
