import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { can } from "@schoolos/core";
import { connectDb } from "@schoolos/db";
import { PrintButton } from "@/components/admin/print-button";
import { reportDir, reportLabels } from "@/components/admin/report-labels";
import { resolveActiveMembership } from "@/server/auth";
import { getReportCard } from "@/server/results";

export const dynamic = "force-dynamic";

type SubjectRow = { subjectId: string; name: string; maxMarks: number; status: string; marks: number | null; grade: string | null; passed: boolean | null };

export default async function ReportCardPage(props: { params: Promise<{ examId: string; studentId: string }> }) {
  const params = await props.params;
  const actor = await resolveActiveMembership();
  await connectDb();
  if (!can(actor.role, "exams:read")) return <Card className="mb-4"><p className="muted">Your role cannot view results.</p></Card>;
  const c = await getReportCard(actor, params.examId, params.studentId);
  if (!c) return <Card className="mb-4"><Notice tone="error">Report card not found. Results may not be published yet.</Notice></Card>;
  const t = reportLabels(c.locale);
  const r = c.result;
  const rows = r.subjects as unknown as SubjectRow[];
  return (
    <>
      <p className="no-print flex flex-wrap items-center gap-3"><Link className="font-semibold text-brand" href={`/admin/exams/${c.exam.id}/results`}>← Results</Link> <PrintButton label="Print report card" /></p>
      <article className={`report locale-${c.locale}`} dir={reportDir(c.locale)} lang={c.locale}>
        <h1>{c.school}</h1>
        <h2>{t.card} · {c.exam.name}{c.exam.term ? ` · ${c.exam.term}` : ""}</h2>
        <p>{t.student}: <strong>{r.name}</strong> · {t.id}: {r.studentNumber}<br />{t.cls}: {c.exam.className} · {t.section}: {r.section}</p>
        <div className="table-scroll"><table>
          <thead><tr><th>{t.subject}</th><th>{t.full}</th><th>{t.marks}</th><th>{t.grade}</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.subjectId}><td>{s.name}</td><td>{s.maxMarks}</td><td>{s.status === "ABSENT" ? t.absent : s.status === "EXEMPT" ? t.exempt : s.marks}</td><td>{s.grade ?? "—"}</td></tr>
            ))}
            <tr><th>{t.total}</th><th>{r.totalMax}</th><th>{r.totalMarks}</th><th>{r.grade}</th></tr>
          </tbody>
        </table></div>
        <p>{t.percent}: {r.percent}%{r.gpa != null ? ` · ${t.gpa}: ${r.gpa}` : ""}</p>
        <p className={r.passed ? "result-pass" : "result-fail"}><strong>{t.result}: {r.passed ? t.pass : t.fail}</strong></p>
        {r.overridden ? <p className="muted small">{t.decided}</p> : null}
        <p className="muted small">{t.version} {c.version} · {t.published} {c.publishedAt.slice(0, 10)}</p>
        <p style={{ display: "flex", justifyContent: "space-between", marginBlockStart: "3rem" }}><span>{t.sign1}</span><span>{t.sign2}</span></p>
      </article>
    </>
  );
}
