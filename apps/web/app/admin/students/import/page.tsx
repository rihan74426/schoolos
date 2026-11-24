import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { ImportClient } from "@/components/admin/import-client";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { listCurrentSections } from "@/server/students";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const actor = await resolveActiveMembership();
  if (!can(actor.role, "student:write")) {
    return <Card className="mb-4"><p className="muted">Your role cannot import students.</p></Card>;
  }
  await connectDb();
  const sections = await listCurrentSections(actor);
  return (
    <>
      <PageHeading title="Import students" description="Upload a CSV, review problems, then import the valid rows." />
      <Card className="mb-4">
        <p className="muted small">
          Columns: studentNumber, firstName, lastName (optional), dateOfBirth (YYYY-MM-DD), guardianName, guardianPhone, guardianRelationship, guardianEmail.
          Up to 500 rows. Students sharing a guardian phone number are linked to one guardian.{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download route handler */}
          <a className="text-link" href="/admin/students/import/template">Download template</a> · <Link className="text-link" href="/admin/students">Back to students</Link>
        </p>
        <ImportClient sections={sections} />
      </Card>
    </>
  );
}
