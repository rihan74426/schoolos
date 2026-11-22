"use server";

import { authFailure, requirePermission } from "@/server/auth";
import { saveGradingScheme, updateInstitutionPolicy } from "@/server/policy";
import { revalidatePath } from "next/cache";
import { parseBandLines } from "@schoolos/core";
import {
  assignTeacher,
  createAcademicYear,
  createGradeLevel,
  createSection,
  endTeacherAssignment,
  setCurrentAcademicYear,
} from "@/server/structure";
import { createSubject, mapSubjectToClass, setSubjectCore, unmapSubjectFromClass } from "@/server/subjects";
import { getInstitutionPolicy } from "@/server/policy";
import type { Actor } from "@/server/auth";
import { createInvitation, revokeInvitation } from "@/server/invitations";
import { appOrigin } from "@/server/origin";
import { connectDb, Institution } from "@schoolos/db";
export async function updatePolicyAction(input: unknown, expectedVersion: number) {
  try {
    const actor = await requirePermission("policy:write");
    return await updateInstitutionPolicy(input, expectedVersion, actor);
  } catch (error) {
    return authFailure(error);
  }
}

export async function saveGradingSchemeAction(input: unknown, makeDefault = false) {
  try {
    const actor = await requirePermission("policy:write");
    return await saveGradingScheme(input, { makeDefault }, actor);
  } catch (error) {
    return authFailure(error);
  }
}

// ---- Form actions (useFormState): return a message instead of throwing ----

export type FormState = { ok: boolean; message: string } | null;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const num = (fd: FormData, key: string) => Number(fd.get(key));

async function run(
  permission: string,
  fn: (actor: Actor) => Promise<{ ok: true } | { ok: false; error: string }>,
  okMessage: string,
): Promise<FormState> {
  try {
    const actor = await requirePermission(permission);
    const result = await fn(actor);
    if (!result.ok) return { ok: false, message: result.error };
    revalidatePath("/admin/settings");
    return { ok: true, message: okMessage };
  } catch (error) {
    const failure = authFailure(error);
    return { ok: false, message: failure.error };
  }
}

export async function createYearAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => createAcademicYear({
    name: text(fd, "name"), startsOn: text(fd, "startsOn"), endsOn: text(fd, "endsOn"),
    makeCurrent: fd.get("makeCurrent") === "on",
  }, actor), "Academic year added");
}

export async function setCurrentYearAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => setCurrentAcademicYear(text(fd, "yearId"), actor), "Current year updated");
}

export async function createGradeLevelAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => createGradeLevel({
    name: text(fd, "name"), sortOrder: Number(fd.get("sortOrder") || 0),
  }, actor), "Grade level added");
}

export async function createSectionAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => createSection({
    academicYearId: text(fd, "academicYearId"), gradeLevelId: text(fd, "gradeLevelId"), name: text(fd, "name"),
  }, actor), "Section added");
}

export async function assignTeacherAction(_: FormState, fd: FormData) {
  return run("teaching:assign", (actor) => assignTeacher({
    membershipId: text(fd, "membershipId"), sectionId: text(fd, "sectionId"), ...(text(fd, "subjectId") ? { subjectId: text(fd, "subjectId") } : {}),
  }, actor), "Teacher assigned");
}

export async function endAssignmentAction(_: FormState, fd: FormData) {
  return run("teaching:assign", (actor) => endTeacherAssignment(text(fd, "assignmentId"), actor), "Assignment ended");
}

export async function createGradingSchemeAction(_: FormState, fd: FormData) {
  const parsedBands = parseBandLines(text(fd, "bands"));
  if ("error" in parsedBands) return { ok: false, message: parsedBands.error } as FormState;
  const key = text(fd, "name").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return run("policy:write", (actor) => saveGradingScheme({
    key, name: text(fd, "name"), kind: "CUSTOM", passPercent: num(fd, "passPercent"),
    failLabel: text(fd, "failLabel") || "F", bands: parsedBands.bands,
  }, { makeDefault: fd.get("makeDefault") === "on" }, actor), "Grading scheme saved");
}

export async function updateRulesAction(_: FormState, fd: FormData) {
  return run("policy:write", async (actor) => {
    const current = await getInstitutionPolicy(actor.institutionId);
    if (!current) return { ok: false as const, error: "Policy not found" };
    const base = current.policy as Record<string, any>;
    const lateMode = text(fd, "lateMode");
    const lateFee =
      lateMode === "FLAT"
        ? { mode: "FLAT", flatMinor: Math.round(num(fd, "lateAmount") * 100), graceDays: num(fd, "graceDays") || 0 }
        : lateMode === "PERCENT_PER_DAY"
          ? { mode: "PERCENT_PER_DAY", percent: num(fd, "lateAmount"), graceDays: num(fd, "graceDays") || 0, capPercent: num(fd, "capPercent") || 100 }
          : { mode: "NONE" };
    const next = {
      ...base,
      gradingSchemeKey: text(fd, "gradingSchemeKey") || base.gradingSchemeKey,
      attendance: {
        ...base.attendance,
        minimumAttendancePercent: num(fd, "minimumAttendancePercent"),
        flagBelowPercent: num(fd, "flagBelowPercent"),
        correctionWindowHours: num(fd, "correctionWindowHours"),
        requireFullRoster: fd.get("requireFullRoster") === "on",
      },
      fees: { ...base.fees, lateFee },
    };
    return updateInstitutionPolicy(next, num(fd, "version"), actor);
  }, "Rules updated");
}

export type InviteState = { ok: boolean; message: string; link?: string; shareText?: string } | null;

export async function createInviteAction(_: InviteState, fd: FormData): Promise<InviteState> {
  try {
    const actor = await requirePermission("staff:invite");
    const result = await createInvitation(
      { role: text(fd, "role"), inviteeNote: text(fd, "inviteeNote") },
      actor,
    );
    if (!result.ok) return { ok: false, message: result.error };
    await connectDb();
    const school = (await Institution.findOne({ _id: actor.institutionId }).lean()) as unknown as { name: string } | null;
    const link = `${await appOrigin()}/join/${result.token}`;
    revalidatePath("/admin/settings");
    return {
      ok: true,
      message: "Link ready. It works once and expires in 7 days. Copy it now; it is not shown again.",
      link,
      shareText: `Assalamu alaikum. You are invited to join ${school?.name ?? "our school"} on SchoolOS as ${text(fd, "role").replace(/_/g, " ").toLowerCase()}: ${link}`,
    };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

export async function revokeInviteAction(_: FormState, fd: FormData) {
  return run("staff:invite", (actor) => revokeInvitation(text(fd, "invitationId"), actor), "Invitation revoked");
}

export async function createSubjectAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => createSubject({ code: text(fd, "code"), name: text(fd, "name"), isCore: fd.get("isCore") === "on" }, actor), "Subject added");
}

export async function setSubjectCoreAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => setSubjectCore(text(fd, "subjectId"), text(fd, "isCore") === "1", actor), "Subject updated");
}

export async function mapSubjectAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => mapSubjectToClass({ gradeLevelId: text(fd, "gradeLevelId"), subjectId: text(fd, "subjectId"), defaultMaxMarks: Number(text(fd, "defaultMaxMarks") || 100) }, actor), "Subject added to class");
}

export async function unmapSubjectAction(_: FormState, fd: FormData) {
  return run("structure:write", (actor) => unmapSubjectFromClass(text(fd, "gradeLevelId"), text(fd, "subjectId"), actor), "Subject removed from class");
}
