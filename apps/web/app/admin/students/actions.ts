"use server";

import { revalidatePath } from "next/cache";
import { authFailure, requirePermission } from "@/server/auth";
import { addGuardian, createStudent, enrollStudent, importStudents } from "@/server/students";
import type { ImportReport } from "@/server/students";

export type FormState = { ok: boolean; message: string } | null;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

async function run(fn: (actor: Awaited<ReturnType<typeof requirePermission>>) => Promise<{ ok: true } | { ok: false; error: string }>, okMessage: string): Promise<FormState> {
  try {
    const actor = await requirePermission("student:write");
    const result = await fn(actor);
    if (!result.ok) return { ok: false, message: result.error };
    revalidatePath("/admin/students", "layout");
    return { ok: true, message: okMessage };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

function guardianFrom(fd: FormData) {
  const fullName = text(fd, "guardianName").trim();
  const phone = text(fd, "guardianPhone").trim();
  if (!fullName && !phone) return undefined;
  return { fullName, phone, relationship: text(fd, "guardianRelationship").trim() || "Guardian", isPrimary: true };
}

export async function createStudentAction(_: FormState, fd: FormData) {
  return run(
    (actor) =>
      createStudent(
        {
          studentNumber: text(fd, "studentNumber"),
          firstName: text(fd, "firstName"),
          lastName: text(fd, "lastName"),
          dateOfBirth: text(fd, "dateOfBirth"),
          guardian: guardianFrom(fd),
        },
        text(fd, "sectionId") || undefined,
        actor,
      ),
    "Student added",
  );
}

export async function enrollStudentAction(_: FormState, fd: FormData) {
  return run((actor) => enrollStudent({ studentId: text(fd, "studentId"), sectionId: text(fd, "sectionId") }, actor), "Enrollment updated");
}

export async function addGuardianAction(_: FormState, fd: FormData) {
  return run((actor) => addGuardian({ studentId: text(fd, "studentId"), guardian: guardianFrom(fd) ?? {} }, actor), "Guardian linked");
}

export type ImportResult = ({ ok: false; error: string } | ImportReport);

export async function importStudentsAction(csvText: string, sectionId: string, commit: boolean): Promise<ImportResult> {
  try {
    const actor = await requirePermission("student:write");
    const result = await importStudents(csvText, { sectionId: sectionId || undefined, commit }, actor);
    if (result.ok && result.committed) revalidatePath("/admin/students", "layout");
    return result;
  } catch (error) {
    return { ok: false, error: authFailure(error).error };
  }
}
