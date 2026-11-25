import { Notice } from "@/components/ui/notice";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeading } from "@/components/admin/page-heading";
import { Pager } from "@/components/admin/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { resolveActiveMembership } from "@/server/auth";
import { listCurrentSections, listStudents } from "@/server/students";
import { createStudentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StudentsPage(props: { searchParams: Promise<{ q?: string; section?: string; status?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "student:read")) {
    return <Card><p className="m-0 text-sm text-fg-muted">Your role cannot view students.</p></Card>;
  }
  await connectDb();
  const canWrite = can(actor.role, "student:write");
  const q = searchParams.q ?? "";
  const [list, sections] = await Promise.all([
    listStudents(actor, { q, sectionId: searchParams.section, status: searchParams.status, page: Number(searchParams.page) || 1 }),
    listCurrentSections(actor),
  ]);
  const sectionLabel = new Map(sections.map((s) => [s.id, s.label]));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const link = (page: number) => `/admin/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(searchParams.section ? { section: searchParams.section } : {}), ...(searchParams.status ? { status: searchParams.status } : {}), page: String(page) })}`;

  return (
    <>
      <PageHeading title="Students" description="Student directory, enrollment, and profile management." />
      <Card className="mb-4 grid gap-4">
        <div className="flex items-center justify-between gap-2"><CardTitle>Directory</CardTitle><Badge>{list.total} students</Badge></div>
        <form method="get" className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
          <label className="grid gap-1 text-sm font-medium text-fg">Search name or ID<Input name="q" defaultValue={q} maxLength={60} placeholder="Name or student ID" /></label>
          <label className="grid gap-1 text-sm font-medium text-fg">Class / section
            <Select name="section" defaultValue={searchParams.section ?? ""}>
              <option value="">All</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-fg">Status
            <Select name="status" defaultValue={searchParams.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option><option value="WITHDRAWN">Withdrawn</option><option value="all">All</option>
            </Select>
          </label>
          <Button type="submit">Search</Button>
        </form>
        {list.rows.length ? (
          <div className="table-scroll"><table className="table-cards">
            <thead><tr><th>Student</th><th>ID</th><th>Class / section</th><th>Status</th></tr></thead>
            <tbody>
              {list.rows.map((s) => (
                <tr key={String(s._id)}>
                  <td data-label="Student"><Link className="font-semibold text-brand" href={`/admin/students/${String(s._id)}`}>{`${s.firstName} ${s.lastName ?? ""}`.trim()}</Link></td>
                  <td data-label="ID">{s.studentNumber}</td>
                  <td data-label="Class / section">{s.sectionId ? sectionLabel.get(String(s.sectionId)) ?? "—" : <Badge tone="warn">Not enrolled</Badge>}</td>
                  <td data-label="Status"><Badge tone={s.status === "ACTIVE" ? "ok" : "muted"}>{s.status.toLowerCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : (
          <EmptyState title={q || searchParams.section ? "No students match" : "No students yet"}>
            {q || searchParams.section ? "Try a different name, ID or section." : "Add one below or import a CSV."}
          </EmptyState>
        )}
        <Pager page={list.page} pages={pages} href={link} />
      </Card>

      {canWrite ? (
        <Card className="mb-4">
          <div className="panel-heading"><h2>Add a student</h2><Link className="text-link" href="/admin/students/import">Import CSV →</Link></div>
          <ActionForm action={createStudentAction} submitLabel="Add student">
            <label>Student ID<Input name="studentNumber" required maxLength={30} /></label>
            <label>Class / section<Select name="sectionId" defaultValue=""><option value="">Enroll later</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></label>
            <label>First name<Input name="firstName" required maxLength={60} /></label>
            <label>Family name (optional)<Input name="lastName" maxLength={60} /></label>
            <label>Date of birth<Input type="date" name="dateOfBirth" /></label>
            <label>Guardian name (optional)<Input name="guardianName" maxLength={100} /></label>
            <label>Guardian mobile<Input name="guardianPhone" inputMode="tel" placeholder="01XXXXXXXXX" /></label>
            <label>Relationship<Input name="guardianRelationship" maxLength={30} placeholder="Father" /></label>
          </ActionForm>
          {sections.length === 0 ? <Notice tone="hint">No current-year sections yet. Create them in Settings to enroll students.</Notice> : null}
        </Card>
      ) : null}
    </>
  );
}
