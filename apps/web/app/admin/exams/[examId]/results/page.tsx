import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PageHeading } from "@/components/admin/page-heading";
import { resolveActiveMembership } from "@/server/auth";
import { getResults } from "@/server/results";

export const dynamic = "force-dynamic";

export default async function ResultsPage(props: { params: Promise<{ examId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "exams:read")) return <section className="panel"><p className="muted">Your role cannot view results.</p></section>;
  const r = await getResults(actor, params.examId);
  if (!r) return <><PageHeading title="Results" description="" /><section className="panel"><p className="muted">Results are not published yet.</p></section></>;
  const passed = r.results.filter((x) => x.passed).length;
  return (
    <>
      <PageHeading title={`${r.exam.name} results`} description={`${r.exam.className} · version ${r.version} · published ${r.publishedAt.slice(0, 10)} · ${passed} of ${r.results.length} passed`} />
      <p><Link href={`/admin/exams/${r.exam.id}`}>← Exam</Link></p>
      <section className="panel">
        <div className="table-scroll"><table><thead><tr><th>Section</th><th>ID</th><th>Student</th><th>Total</th><th>%</th><th>Grade</th><th>GPA</th><th>Result</th><th /></tr></thead><tbody>
          {r.results.map((x) => (
            <tr key={x.studentId}><td>{x.section}</td><td>{x.studentNumber}</td><td>{x.name}</td><td>{x.totalMarks}/{x.totalMax}</td><td>{x.percent}</td><td>{x.grade}</td><td>{x.gpa ?? "—"}</td>
              <td>{x.passed ? "Pass" : "Fail"}{x.overridden ? " (decision)" : ""}{!x.passed && Array.isArray(x.failedSubjects) && x.failedSubjects.length ? `: ${(x.failedSubjects as string[]).join(", ")}` : ""}</td>
              <td><Link href={`/admin/exams/${r.exam.id}/report/${x.studentId}`}>Report card</Link></td></tr>
          ))}
        </tbody></table></div>
      </section>
    </>
  );
}
