"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAttendanceAction } from "@/app/admin/academics/attendance/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type Student = { id: string; number: string; name: string; status: Status | null };

const OPTIONS: Array<{ value: Status; short: string; label: string; on: string }> = [
  { value: "PRESENT", short: "P", label: "Present", on: "border-ok bg-ok text-white" },
  { value: "ABSENT", short: "A", label: "Absent", on: "border-err bg-err text-white" },
  { value: "LATE", short: "L", label: "Late", on: "border-warn bg-warn text-white" },
  { value: "EXCUSED", short: "E", label: "Excused", on: "border-brand bg-brand text-white" },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

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
  const [initial] = useState<Record<string, Status | null>>(() => Object.fromEntries(students.map((s) => [s.id, s.status])));
  const [marks, setMarks] = useState<Record<string, Status | null>>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const marked = students.filter((s) => marks[s.id]);
  const counts = OPTIONS.map((o) => ({ ...o, n: students.filter((s) => marks[s.id] === o.value).length }));
  const isCorrection = Boolean(submittedAt);
  const changed = students.some((s) => marks[s.id] !== initial[s.id]);
  const complete = requireFullRoster ? marked.length === students.length : marked.length > 0;
  const locked = isCorrection && !canCorrect;
  const canSubmit = complete && !busy && !locked && (!isCorrection || changed);
  const percent = students.length ? Math.round((marked.length / students.length) * 100) : 0;

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
    setAskReason(false);
    setReason("");
    setMessage({ ok: true, text: isCorrection ? "Correction saved" : "Attendance submitted" });
    router.refresh();
  }

  if (!students.length) return <p className="m-0 text-sm text-fg-muted">No active students in this section.</p>;

  return (
    <div className="grid gap-4">
      {submittedAt ? (
        <p className="m-0 rounded-[10px] bg-brand-soft p-3 text-sm text-brand">
          Submitted {new Date(submittedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}.{" "}
          {canCorrect ? "Changes need a correction reason." : "Correction window closed. Ask a coordinator."}
        </p>
      ) : null}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" disabled={locked} onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "PRESENT" as Status])))}>
            Mark all present
          </Button>
          <span className="text-sm font-semibold text-fg" aria-live="polite">{marked.length}/{students.length} marked</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Roster progress">
          <div className="h-full rounded-full bg-grad transition-[width] duration-300 ease-brand" style={{ width: `${percent}%` }} />
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {counts.map((c) => (
            <li key={c.value} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-muted">{c.label} {c.n}</li>
          ))}
        </ul>
      </div>

      <ul className="m-0 grid list-none gap-2 p-0">
        {students.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-2.5 ps-3">
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{initials(s.name)}</span>
              <span className="grid min-w-0">
                <strong className="truncate text-sm text-fg">{s.name}</strong>
                <small className="text-xs text-fg-muted">{s.number}</small>
              </span>
            </span>
            <span className="flex flex-none gap-1.5" role="group" aria-label={`Attendance for ${s.name}`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={marks[s.id] === o.value}
                  aria-label={o.label}
                  title={o.label}
                  disabled={locked}
                  onClick={() => setMarks((m) => ({ ...m, [s.id]: o.value }))}
                  className={cn(
                    "size-11 rounded-[10px] border border-line-strong bg-surface text-sm font-bold text-fg transition duration-150 ease-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-95",
                    marks[s.id] === o.value && o.on,
                  )}
                >
                  {o.short}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border max-md:bottom-[calc(72px+env(safe-area-inset-bottom))]">
        <Button disabled={!canSubmit} onClick={() => (isCorrection ? setAskReason(true) : send())}>
          {busy ? "Saving…" : isCorrection ? "Save correction" : "Submit attendance"}
        </Button>
        {!complete ? <span className="text-xs text-fg-muted">Mark every student to submit.</span> : null}
        {message ? <span role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-ok" : "text-err")}>{message.text}</span> : null}
      </div>

      <Sheet open={askReason} onOpenChange={setAskReason}>
        <SheetContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 10) void send(reason);
            }}
          >
            <SheetTitle className="m-0 text-base font-semibold text-fg">Why are you correcting this?</SheetTitle>
            <SheetDescription className="m-0 text-xs text-fg-muted">Saved in the audit log with the before and after values.</SheetDescription>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="At least 10 characters" aria-label="Correction reason" />
            <p className="m-0 text-xs text-fg-muted">{reason.trim().length}/10 minimum</p>
            {message && !message.ok ? <p role="alert" className="m-0 text-sm text-err">{message.text}</p> : null}
            <div className="flex justify-end gap-2">
              <SheetClose asChild><Button type="button" variant="secondary">Cancel</Button></SheetClose>
              <Button type="submit" disabled={busy || reason.trim().length < 10}>Confirm correction</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
