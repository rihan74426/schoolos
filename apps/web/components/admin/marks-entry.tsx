"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markError } from "@schoolos/core";
import { saveMarksAction, submitSheetAction } from "@/app/admin/exams/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "ABSENT" | "EXEMPT";
type Student = { id: string; number: string; name: string; status: Status | null; marks: number | null };
type Row = { status: Status | null; marks: string };

const flag = "min-h-tap rounded-[10px] border border-line-strong bg-surface px-3 text-xs font-semibold text-fg transition duration-150 ease-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50";

export function MarksEntry({ assessmentId, maxMarks, students, canEdit }: { assessmentId: string; maxMarks: number; students: Student[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(students.map((s) => [s.id, { status: s.status, marks: s.marks == null ? "" : String(s.marks) }])));

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const entered = students.filter((s) => rows[s.id].status === "ABSENT" || rows[s.id].status === "EXEMPT" || (rows[s.id].status === "PRESENT" && rows[s.id].marks !== "")).length;
  const percent = students.length ? Math.round((entered / students.length) * 100) : 0;

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
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="m-0 text-sm text-fg-muted" role="status">{entered} of {students.length} entered · full marks {maxMarks}</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Entry progress">
          <div className="h-full rounded-full bg-grad transition-[width] duration-300 ease-brand" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {students.map((s) => {
          const r = rows[s.id];
          const off = r.status === "ABSENT" || r.status === "EXEMPT";
          return (
            <li key={s.id} className="grid grid-cols-[1fr_6rem] items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface p-3 sm:grid-cols-[1fr_6rem_auto]">
              <span className="grid min-w-0">
                <strong className="truncate text-sm text-fg">{s.name}</strong>
                <small className="text-xs text-fg-muted">{s.number}</small>
              </span>
              <input
                inputMode="decimal"
                aria-label={`Marks for ${s.name}`}
                value={off ? "" : r.marks}
                disabled={!canEdit || off}
                placeholder={off ? (r.status ?? "") : `/ ${maxMarks}`}
                onChange={(e) => set(s.id, { status: e.target.value.trim() === "" ? null : "PRESENT", marks: e.target.value })}
                className="min-h-tap w-full rounded-[10px] border border-line-strong bg-surface px-2 text-center text-base text-fg placeholder:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:bg-surface-2"
              />
              {canEdit ? (
                <span className="col-span-2 flex gap-2 sm:col-span-1">
                  <button type="button" aria-pressed={r.status === "ABSENT"} className={cn(flag, "flex-1 sm:flex-none", r.status === "ABSENT" && "border-err bg-err text-white")} onClick={() => set(s.id, r.status === "ABSENT" ? { status: null, marks: "" } : { status: "ABSENT", marks: "" })}>Absent</button>
                  <button type="button" aria-pressed={r.status === "EXEMPT"} className={cn(flag, "flex-1 sm:flex-none", r.status === "EXEMPT" && "border-brand bg-brand text-white")} onClick={() => set(s.id, r.status === "EXEMPT" ? { status: null, marks: "" } : { status: "EXEMPT", marks: "" })}>Exempt</button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="sticky z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur max-md:bottom-[calc(72px+env(safe-area-inset-bottom))] bottom-0 sm:mx-0 sm:rounded-card sm:border">
          <Button variant="secondary" disabled={pending} onClick={() => save(false)}>{pending ? "Saving…" : "Save"}</Button>
          <Button disabled={pending || entered < students.length} onClick={() => save(true)}>Save and submit for approval</Button>
        </div>
      ) : null}
      {message ? <p role={message.ok ? "status" : "alert"} className={cn("m-0 text-sm", message.ok ? "text-ok" : "text-err")}>{message.text}</p> : null}
    </div>
  );
}
