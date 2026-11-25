"use client";
import { formGrid } from "@/lib/form-classes";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { useState, useTransition } from "react";
import { importStudentsAction } from "@/app/admin/students/actions";
import type { ImportResult } from "@/app/admin/students/actions";

export function ImportClient({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setResult(null);
    if (!file) return;
    if (file.size > 1_000_000) {
      setText("");
      setResult({ ok: false, error: "File is too large (max 1 MB)" });
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  const run = (commit: boolean) => start(async () => setResult(await importStudentsAction(text, sectionId, commit)));
  const report = result && result.ok ? result : null;

  return (
    <div className={formGrid}>
      <label className="wide">CSV file
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <label>Enroll everyone in
        <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setResult(null); }}>
          <option value="">Don&apos;t enroll yet</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </label>
      <Button type="button" disabled={!text || pending} onClick={() => run(false)}>
        {pending ? "Checking…" : "Preview"}
      </Button>

      {result && !result.ok ? <p role="alert" className="form-error md:col-span-2">{result.error}</p> : null}

      {report ? (
        <div className="wide import-report">
          <p role="status" className={report.committed ? "form-ok" : "muted"}>
            {report.committed
              ? `Imported ${report.validCount} students.${report.errors.length ? ` ${report.errors.length} problem(s) were skipped.` : ""}`
              : `${fileName}: ${report.validCount} of ${report.total} rows are ready. Rows with problems are skipped.`}
          </p>
          {report.errors.length ? (
            <div className="table-scroll">
              <table><thead><tr><th>Line</th><th>Problem</th></tr></thead>
                <tbody>{report.errors.map((e, i) => <tr key={i}><td>{e.line}</td><td>{e.message}</td></tr>)}</tbody></table>
            </div>
          ) : null}
          {report.preview.length && !report.committed ? (
            <div className="table-scroll">
              <table><thead><tr><th>Line</th><th>ID</th><th>Student</th><th>Guardian</th></tr></thead>
                <tbody>{report.preview.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.studentNumber}</td><td>{r.name}</td><td>{r.guardian ?? "—"}</td></tr>)}</tbody></table>
              {report.validCount > report.preview.length ? <p className="muted small">Showing the first {report.preview.length}.</p> : null}
            </div>
          ) : null}
          {!report.committed && report.validCount > 0 ? (
            <Button type="button" disabled={pending} onClick={() => run(true)}>
              {pending ? "Importing…" : `Import ${report.validCount} students`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
