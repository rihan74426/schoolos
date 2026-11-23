"use server";

import { revalidatePath } from "next/cache";
import { authFailure, requirePermission } from "@/server/auth";
import type { Actor } from "@/server/auth";
import {
  approveSheet, createExam, openExam, returnSheet, saveMarks, setPassOverride, submitSheet, updateAssessment, updateExamRules,
} from "@/server/exams";
import { decideCorrection, publishExam, requestCorrection } from "@/server/results";

export type FormState = { ok: boolean; message: string } | null;
type Outcome = { ok: true; message?: string } | { ok: false; error: string };
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function guard(permission: string, fn: (actor: Actor) => Promise<Outcome>, okMessage: string): Promise<FormState> {
  try {
    const actor = await requirePermission(permission);
    const res = await fn(actor);
    if (!res.ok) return { ok: false, message: res.error };
    revalidatePath("/admin/exams", "layout");
    return { ok: true, message: res.message ?? okMessage };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

export async function createExamAction(_: FormState, fd: FormData) {
  return guard("exams:write", async (actor) => {
    const res = await createExam({ name: text(fd, "name"), term: text(fd, "term"), academicYearId: text(fd, "academicYearId"), gradeLevelId: text(fd, "gradeLevelId"), passRule: text(fd, "passRule") || "ALL_SUBJECTS" }, actor);
    return res.ok ? { ok: true as const, message: `Exam created with ${res.assessments} papers. Check full marks, then open it for marks entry.` } : res;
  }, "Exam created");
}

export async function updateAssessmentAction(_: FormState, fd: FormData) {
  return guard("exams:write", (actor) => updateAssessment({ assessmentId: text(fd, "assessmentId"), maxMarks: Number(text(fd, "maxMarks")), ...(text(fd, "date") ? { date: text(fd, "date") } : {}) }, actor), "Paper updated");
}

export async function openExamAction(_: FormState, fd: FormData) {
  return guard("exams:write", (actor) => openExam(text(fd, "examId"), actor), "Exam opened. Teachers can enter marks.");
}

export async function updateExamRulesAction(_: FormState, fd: FormData) {
  return guard("exams:publish", (actor) => updateExamRules(text(fd, "examId"), text(fd, "passRule"), actor), "Pass rule saved");
}

export async function setPassOverrideAction(_: FormState, fd: FormData) {
  return guard("exams:publish", (actor) => setPassOverride({ examId: text(fd, "examId"), studentId: text(fd, "studentId"), reason: text(fd, "reason"), remove: fd.get("remove") === "1" }, actor), "Saved");
}

// Called from the marks-entry client component with plain data (not a form).
export async function saveMarksAction(assessmentId: string, entries: Array<{ studentId: string; status: string; marks?: number }>): Promise<FormState> {
  return guard("exams:enter", async (actor) => {
    const res = await saveMarks({ assessmentId, entries }, actor);
    return res.ok ? { ok: true as const, message: `Saved ${res.saved} entries` } : res;
  }, "Saved");
}

export async function submitSheetAction(assessmentId: string): Promise<FormState> {
  return guard("exams:enter", (actor) => submitSheet(assessmentId, actor), "Submitted for approval");
}

export async function approveSheetAction(_: FormState, fd: FormData) {
  return guard("exams:approve", (actor) => approveSheet(text(fd, "assessmentId"), actor), "Sheet approved");
}

export async function returnSheetAction(_: FormState, fd: FormData) {
  return guard("exams:approve", (actor) => returnSheet({ assessmentId: text(fd, "assessmentId"), reason: text(fd, "reason") }, actor), "Sheet sent back");
}

export async function publishExamAction(_: FormState, fd: FormData) {
  return guard("exams:publish", async (actor) => {
    const res = await publishExam(text(fd, "examId"), actor);
    return res.ok ? { ok: true as const, message: `Published results for ${res.students} students.` } : res;
  }, "Published");
}

export async function requestCorrectionAction(_: FormState, fd: FormData) {
  return guard("exams:enter", (actor) => requestCorrection({
    assessmentId: text(fd, "assessmentId"), studentId: text(fd, "studentId"), status: text(fd, "status"),
    ...(text(fd, "status") === "PRESENT" ? { marks: Number(text(fd, "marks")) } : {}), reason: text(fd, "reason"),
  }, actor), "Correction sent for approval");
}

export async function decideCorrectionAction(_: FormState, fd: FormData) {
  return guard("exams:publish", async (actor) => {
    const res = await decideCorrection({ correctionId: text(fd, "correctionId"), approve: text(fd, "decision") === "approve", note: text(fd, "note") }, actor);
    return res.ok ? { ok: true as const, message: res.version ? `Approved. Result version ${res.version} published.` : "Rejected" } : res;
  }, "Done");
}
