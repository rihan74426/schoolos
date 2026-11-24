import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { StatusBadge } from "@/components/admin/status-badge";
import { resolveActiveMembership } from "@/server/auth";
import { getResults } from "@/server/results";

export const dynamic = "force-dynamic";

export default async function ResultsPage(props: { params: Promise<{ examId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "exams:read")) return <Card className="mb-4"><p className="muted">Your role cannot view results.</p></Card>;
  const r = await getResults(actor, params.examId);
  if (!r) return <><PageHeading title="Results" description="" /><Card className="mb-4"><p className="muted">Results are not published yet.</p></Card></>;
  const passed = r.results.filter((x) => x.passed).length;
  return (
    <>
      <PageHeading title={`${r.exam.name} results`} description={`${r.exam.className} · version ${r.version} · published ${r.publishedAt.slice(0, 10)} · ${passed} of ${r.results.length} passed`} />
      <p><Link href={`/admin/exams/${r.exam.id}`}>← Exam</Link></p>
      <Card className="mb-4">
        <div className="table-scroll"><table className="table-cards"><thead><tr><th>Section</th><th>ID</th><th>Student</th><th>Total</th><th>%</th><th>Grade</th><th>GPA</th><th>Result</th><th /></tr></thead><tbody>
          {r.results.map((x) => (
            <tr key={x.studentId}><td data-label="Section">{x.section}</td><td data-label="ID">{x.studentNumber}</td><td data-label="Student"><strong>{x.name}</strong></td><td data-label="Total">{x.totalMarks}/{x.totalMax}</td><td data-label="%">{x.percent}</td><td data-label="Grade">{x.grade}</td><td data-label="GPA">{x.gpa ?? "—"}</td>
              <td data-label="Result"><StatusBadge status={x.passed ? "PASS" : "FAIL"}>{x.passed ? "Pass" : "Fail"}</StatusBadge>{x.overridden ? " (decision)" : ""}{!x.passed && Array.isArray(x.failedSubjects) && x.failedSubjects.length ? `: ${(x.failedSubjects as string[]).join(", ")}` : ""}</td>
              <td data-label=""><Link className="font-semibold text-brand" href={`/admin/exams/${r.exam.id}/report/${x.studentId}`}>Report card</Link></td></tr>
          ))}
        </tbody></table></div>
      </Card>
    </>
  );
}
