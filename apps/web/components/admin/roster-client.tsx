"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitAttendanceAction } from "@/app/admin/academics/attendance/actions";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type Student = { id: string; number: string; name: string; status: Status | null };

const OPTIONS: Array<{ value: Status; short: string; label: string }> = [
  { value: "PRESENT", short: "P", label: "Present" },
  { value: "ABSENT", short: "A", label: "Absent" },
  { value: "LATE", short: "L", label: "Late" },
  { value: "EXCUSED", short: "E", label: "Excused" },
];

export function RosterClient({
  sectionId,
  date,
  students,
  requireFullRoster,
  submittedAt,
  canCorrect,
}: {
  sectionId: string;
  date: string;
  students: Student[];
  requireFullRoster: boolean;
  submittedAt: string | null;
  canCorrect: boolean;
}) {
  const router = useRouter();
  const initial = useRef(Object.fromEntries(students.map((s) => [s.id, s.status])));
  const [marks, setMarks] = useState<Record<string, Status | null>>(initial.current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const marked = students.filter((s) => marks[s.id]);
  const counts = OPTIONS.map((o) => ({ ...o, n: students.filter((s) => marks[s.id] === o.value).length }));
  const isCorrection = Boolean(submittedAt);
  const changed = students.some((s) => marks[s.id] !== initial.current[s.id]);
  const complete = requireFullRoster ? marked.length === students.length : marked.length > 0;
  const locked = isCorrection && !canCorrect;
  const canSubmit = complete && !busy && !locked && (!isCorrection || changed);

  async function send(correctionReason?: string) {
    setBusy(true);
    setMessage(null);
    const res = (await submitAttendanceAction({
      sectionId,
      date,
      ...(correctionReason ? { correctionReason: correctionReason.trim() } : {}),
      records: marked.map((s) => ({ studentId: s.id, status: marks[s.id] })),
    })) as { ok: boolean; error?: string };
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "Could not save attendance" });
    dialog.current?.close();
    setReason("");
    setMessage({ ok: true, text: isCorrection ? "Correction saved" : "Attendance submitted" });
    router.refresh();
  }

  if (!students.length) return <p className="muted">No active students in this section.</p>;

  return (
    <div className="roster">
      {submittedAt ? (
        <p className="roster-banner">
          Submitted {new Date(submittedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}.{" "}
          {canCorrect ? "Changes need a correction reason." : "Correction window closed. Ask a coordinator."}
        </p>
      ) : null}
      <div className="roster-tools">
        <button type="button" className="button-link" disabled={locked} onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "PRESENT" as Status])))}>
          All present
        </button>
        <span className="roster-counts" aria-live="polite">
          {counts.map((c) => `${c.short} ${c.n}`).join(" · ")} · {marked.length}/{students.length}
        </span>
      </div>
      <ul className="roster-list">
        {students.map((s) => (
          <li key={s.id} className="roster-row">
            <span className="roster-name">
              <strong>{s.name}</strong>
              <small>{s.number}</small>
            </span>
            <span className="roster-buttons" role="group" aria-label={`Attendance for ${s.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`roster-btn roster-${o.value.toLowerCase()}`}
                  aria-pressed={marks[s.id] === o.value}
                  aria-label={o.label}
                  disabled={locked}
                  onClick={() => setMarks((m) => ({ ...m, [s.id]: o.value }))}
                >
                  {o.short}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="roster-submit">
        <button type="button" className="button-link" disabled={!canSubmit} onClick={() => (isCorrection ? dialog.current?.showModal() : send())}>
          {busy ? "Saving…" : isCorrection ? "Save correction" : "Submit attendance"}
        </button>
        {!complete ? <span className="form-hint">Mark every student to submit.</span> : null}
        {message ? <span role={message.ok ? "status" : "alert"} className={message.ok ? "form-ok" : "form-error"}>{message.text}</span> : null}
      </div>
      <dialog ref={dialog} className="roster-dialog">
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 10) void send(reason);
          }}
        >
          <h3>Why are you correcting this?</h3>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="At least 10 characters" aria-label="Correction reason" />
          <p className="form-hint">{reason.trim().length}/10 minimum. Saved in the audit log.</p>
          {message && !message.ok ? <p role="alert" className="form-error">{message.text}</p> : null}
          <div className="roster-dialog-actions">
            <button type="button" className="button-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className="button-link" disabled={busy || reason.trim().length < 10}>Confirm correction</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
