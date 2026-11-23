"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markError } from "@schoolos/core";
import { saveMarksAction, submitSheetAction } from "@/app/admin/exams/actions";

type Status = "PRESENT" | "ABSENT" | "EXEMPT";
type Student = { id: string; number: string; name: string; status: Status | null; marks: number | null };
type Row = { status: Status | null; marks: string };

export function MarksEntry({ assessmentId, maxMarks, students, canEdit }: { assessmentId: string; maxMarks: number; students: Student[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(students.map((s) => [s.id, { status: s.status, marks: s.marks == null ? "" : String(s.marks) }])));

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const entered = students.filter((s) => rows[s.id].status === "ABSENT" || rows[s.id].status === "EXEMPT" || (rows[s.id].status === "PRESENT" && rows[s.id].marks !== "")).length;

  function collect() {
    const entries: Array<{ studentId: string; status: string; marks?: number }> = [];
    for (const s of students) {
      const r = rows[s.id];
      if (r.status === "ABSENT" || r.status === "EXEMPT") entries.push({ studentId: s.id, status: r.status });
      else if (r.marks.trim() !== "") {
        const marks = Number(r.marks);
        const err = markError(marks, maxMarks);
        if (err) return { error: `${s.name}: ${err}` };
        entries.push({ studentId: s.id, status: "PRESENT", marks });
      }
    }
    return { entries };
  }

  function save(thenSubmit: boolean) {
    const c = collect();
    if ("error" in c) return setMessage({ ok: false, text: c.error as string });
    start(async () => {
      const saved = await saveMarksAction(assessmentId, c.entries ?? []);
      if (!saved?.ok) return setMessage({ ok: false, text: saved?.message ?? "Could not save" });
      if (!thenSubmit) return setMessage({ ok: true, text: saved.message });
      const sub = await submitSheetAction(assessmentId);
      setMessage({ ok: Boolean(sub?.ok), text: sub?.message ?? "Could not submit" });
      if (sub?.ok) router.refresh();
    });
  }

  return (
    <div>
      <p className="muted small" role="status">{entered} of {students.length} entered · full marks {maxMarks}</p>
      <div className="marks-list">
        {students.map((s) => {
          const r = rows[s.id];
          const off = r.status === "ABSENT" || r.status === "EXEMPT";
          return (
            <div key={s.id} className="marks-row">
              <div><strong>{s.name}</strong><div className="muted small">{s.number}</div></div>
              <input
                inputMode="decimal" aria-label={`Marks for ${s.name}`} value={off ? "" : r.marks} disabled={!canEdit || off} placeholder={off ? r.status ?? "" : `/ ${maxMarks}`}
                onChange={(e) => set(s.id, { status: e.target.value.trim() === "" ? null : "PRESENT", marks: e.target.value })}
              />
              {canEdit ? (
                <span className="marks-flags">
                  <button type="button" aria-pressed={r.status === "ABSENT"} onClick={() => set(s.id, r.status === "ABSENT" ? { status: null, marks: "" } : { status: "ABSENT", marks: "" })}>Absent</button>
                  <button type="button" aria-pressed={r.status === "EXEMPT"} onClick={() => set(s.id, r.status === "EXEMPT" ? { status: null, marks: "" } : { status: "EXEMPT", marks: "" })}>Exempt</button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {canEdit ? (
        <p className="marks-actions">
          <button type="button" className="button-link" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save"}</button>{" "}
          <button type="button" className="button-link" disabled={pending || entered < students.length} onClick={() => save(true)}>Save and submit for approval</button>
        </p>
      ) : null}
      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "form-ok" : "form-error"}>{message.text}</p> : null}
    </div>
  );
}
