import "server-only";
import { isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import {
  academicYearInputSchema,
  gradeLevelInputSchema,
  sectionInputSchema,
  teachingAssignmentInputSchema,
} from "@schoolos/core";
import {
  AcademicYear,
  AuditEvent,
  GradeLevel,
  Membership,
  Subject,
  Section,
  TeachingAssignment,
  withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";

type Fail = { ok: false; error: string };
type Ok = { ok: true; id: string };
const DUPLICATE = "That name already exists";

const isDuplicate = (e: unknown) => (e as { code?: number }).code === 11000;

async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: unknown,
  metadata: Record<string, unknown>,
  session: ClientSession | null,
) {
  await AuditEvent.create(
    [
      {
        institutionId: actor.institutionId,
        actorMembershipId: actor.membershipId,
        action,
        entityType,
        entityId: String(entityId),
        metadata,
      },
    ],
    session ? { session } : {},
  );
}

export async function listStructure(institutionId: unknown) {
  const [years, gradeLevels, sections, assignments, teachers] = await Promise.all([
    AcademicYear.find({ institutionId }).sort({ startsOn: -1 }).lean(),
    GradeLevel.find({ institutionId }).sort({ sortOrder: 1, name: 1 }).lean(),
    Section.find({ institutionId, status: "ACTIVE" }).sort({ name: 1 }).lean(),
    TeachingAssignment.find({ institutionId, status: "ACTIVE" }).lean(),
    Membership.find({ institutionId, role: "TEACHER", active: true }).lean(),
  ]);
  return { years, gradeLevels, sections, assignments, teachers } as unknown as {
    years: Array<{ _id: unknown; name: string; startsOn: string; endsOn: string; isCurrent: boolean }>;
    gradeLevels: Array<{ _id: unknown; name: string; sortOrder: number }>;
    sections: Array<{ _id: unknown; name: string; gradeLevelId: unknown; academicYearId: unknown }>;
    assignments: Array<{ _id: unknown; membershipId: unknown; sectionId: unknown; subjectId?: unknown }>;
    teachers: Array<{ _id: unknown; clerkUserId: string }>;
  };
}

export async function createAcademicYear(input: unknown, actor: Actor): Promise<Ok | Fail> {
  const parsed = academicYearInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid academic year" };
  const { makeCurrent, ...data } = parsed.data;
  const { institutionId } = actor;
  try {
    const created = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      // Create first (a duplicate name fails here, before anything is changed), then promote.
      // Clearing the old current year first would leave the school with none if the create failed
      // on a database without transactions.
      const [year] = await AcademicYear.create(
        [{ ...data, institutionId, isCurrent: false, status: makeCurrent ? "ACTIVE" : "DRAFT" }],
        opts,
      );
      if (makeCurrent) {
        await AcademicYear.updateMany({ institutionId, isCurrent: true }, { $set: { isCurrent: false } }, opts);
        await AcademicYear.updateOne({ _id: year._id, institutionId }, { $set: { isCurrent: true } }, opts);
      }
      await audit(actor, "ACADEMIC_YEAR_CREATED", "AcademicYear", year._id, { ...data, makeCurrent }, txn);
      return year;
    });
    return { ok: true, id: String(created._id) };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: DUPLICATE };
    throw e;
  }
}

export async function setCurrentAcademicYear(yearId: string, actor: Actor): Promise<Ok | Fail> {
  if (!isObjectIdOrHexString(yearId)) return { ok: false, error: "Invalid academic year" };
  const { institutionId } = actor;
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const target = await AcademicYear.findOne({ _id: yearId, institutionId }, null, opts).lean();
    if (!target) return false;
    await AcademicYear.updateMany({ institutionId, isCurrent: true }, { $set: { isCurrent: false } }, opts);
    await AcademicYear.updateOne({ _id: yearId, institutionId }, { $set: { isCurrent: true, status: "ACTIVE" } }, opts);
    await audit(actor, "ACADEMIC_YEAR_SET_CURRENT", "AcademicYear", yearId, {}, txn);
    return true;
  });
  return done ? { ok: true, id: yearId } : { ok: false, error: "Academic year not found" };
}

export async function createGradeLevel(input: unknown, actor: Actor): Promise<Ok | Fail> {
  const parsed = gradeLevelInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid grade level" };
  try {
    const created = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const [level] = await GradeLevel.create(
        [{ ...parsed.data, institutionId: actor.institutionId }],
        txn ? { session: txn } : {},
      );
      await audit(actor, "GRADE_LEVEL_CREATED", "GradeLevel", level._id, parsed.data, txn);
      return level;
    });
    return { ok: true, id: String(created._id) };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: DUPLICATE };
    throw e;
  }
}

export async function createSection(input: unknown, actor: Actor): Promise<Ok | Fail> {
  const parsed = sectionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid section" };
  const { institutionId } = actor;
  const { academicYearId, gradeLevelId } = parsed.data;
  // No foreign keys in Mongo: prove both parents belong to this institution.
  const [year, level] = await Promise.all([
    AcademicYear.exists({ _id: academicYearId, institutionId }),
    GradeLevel.exists({ _id: gradeLevelId, institutionId }),
  ]);
  if (!year || !level) return { ok: false, error: "Academic year or grade level not found" };
  try {
    const created = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const [section] = await Section.create([{ ...parsed.data, institutionId }], txn ? { session: txn } : {});
      await audit(actor, "SECTION_CREATED", "Section", section._id, parsed.data, txn);
      return section;
    });
    return { ok: true, id: String(created._id) };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: DUPLICATE };
    throw e;
  }
}

export async function assignTeacher(input: unknown, actor: Actor): Promise<Ok | Fail> {
  const parsed = teachingAssignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid assignment" };
  const { institutionId } = actor;
  const { membershipId, sectionId, subjectId } = parsed.data;
  const [member, section] = await Promise.all([
    Membership.exists({ _id: membershipId, institutionId, role: "TEACHER", active: true }),
    Section.findOne({ _id: sectionId, institutionId, status: "ACTIVE" }).lean() as Promise<{ academicYearId: unknown } | null>,
  ]);
  if (!member) return { ok: false, error: "Teacher not found" };
  if (subjectId && !(await Subject.exists({ _id: subjectId, institutionId, status: "ACTIVE" }))) return { ok: false, error: "Subject not found" };
  if (!section) return { ok: false, error: "Section not found" };
  if (!(await AcademicYear.exists({ _id: section.academicYearId, institutionId, isCurrent: true }))) {
    return { ok: false, error: "Section is not in the current academic year. Make its year current first." };
  }
  const ALREADY = subjectId ? "Teacher already teaches this subject in this section" : "Teacher is already assigned to this section";
  if (await TeachingAssignment.exists({ institutionId, membershipId, sectionId, status: "ACTIVE", ...(subjectId ? { subjectId } : { subjectId: { $exists: false } }) })) {
    return { ok: false, error: ALREADY };
  }
  try {
    const created = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const [row] = await TeachingAssignment.create(
        [{ institutionId, membershipId, sectionId, ...(subjectId ? { subjectId } : {}), academicYearId: section.academicYearId }],
        txn ? { session: txn } : {},
      );
      await audit(actor, "TEACHING_ASSIGNED", "TeachingAssignment", row._id, { membershipId, sectionId, subjectId: subjectId ?? null }, txn);
      return row;
    });
    return { ok: true, id: String(created._id) };
  } catch (e) {
    // Two simultaneous clicks: the partial unique index lets only one ACTIVE row exist.
    if (isDuplicate(e)) return { ok: false, error: ALREADY };
    throw e;
  }
}

export async function endTeacherAssignment(assignmentId: string, actor: Actor): Promise<Ok | Fail> {
  if (!isObjectIdOrHexString(assignmentId)) return { ok: false, error: "Invalid assignment" };
  const { institutionId } = actor;
  const ended = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const row = await TeachingAssignment.findOneAndUpdate(
      { _id: assignmentId, institutionId, status: "ACTIVE" },
      { $set: { status: "ENDED" } },
      { new: true, ...(txn ? { session: txn } : {}) },
    );
    if (!row) return false;
    await audit(actor, "TEACHING_ENDED", "TeachingAssignment", assignmentId, {}, txn);
    return true;
  });
  return ended ? { ok: true, id: assignmentId } : { ok: false, error: "Assignment not found" };
}
