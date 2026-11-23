import "server-only";
import { isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import { classSubjectInputSchema, subjectInputSchema } from "@schoolos/core";
import { AuditEvent, ClassSubject, GradeLevel, Subject, withOptionalTransaction } from "@schoolos/db";
import type { Actor } from "./auth";

type Fail = { ok: false; error: string };
const isDup = (e: unknown) => (e as { code?: number }).code === 11000;

async function audit(actor: Actor, action: string, entityType: string, entityId: unknown, metadata: Record<string, unknown>, txn: ClientSession | null) {
  await AuditEvent.create([{ institutionId: actor.institutionId, actorMembershipId: actor.membershipId, action, entityType, entityId: String(entityId), metadata }], txn ? { session: txn } : {});
}

export async function listSubjects(institutionId: unknown) {
  const [subjects, mappings, levels] = await Promise.all([
    Subject.find({ institutionId, status: "ACTIVE" }).sort({ name: 1 }).lean() as unknown as Promise<Array<{ _id: unknown; code: string; name: string; isCore?: boolean }>>,
    ClassSubject.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; gradeLevelId: unknown; subjectId: unknown; defaultMaxMarks: number }>>,
    GradeLevel.find({ institutionId }).sort({ sortOrder: 1, name: 1 }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
  ]);
  return {
    subjects: subjects.map((s) => ({ id: String(s._id), code: s.code, name: s.name, isCore: Boolean(s.isCore) })),
    levels: levels.map((l) => ({ id: String(l._id), name: l.name })),
    mappings: mappings.map((m) => ({ id: String(m._id), gradeLevelId: String(m.gradeLevelId), subjectId: String(m.subjectId), defaultMaxMarks: m.defaultMaxMarks })),
  };
}

export async function createSubject(input: unknown, actor: Actor): Promise<Fail | { ok: true; id: string }> {
  const parsed = subjectInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subject" };
  const { institutionId } = actor;
  try {
    const id = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const [row] = await Subject.create([{ institutionId, ...parsed.data }], txn ? { session: txn } : {});
      await audit(actor, "SUBJECT_CREATED", "Subject", row._id, parsed.data, txn);
      return String(row._id);
    });
    return { ok: true, id };
  } catch (e) {
    if (isDup(e)) return { ok: false, error: "A subject with this code already exists" };
    throw e;
  }
}

/** Core subjects decide pass/fail under the CORE_ONLY exam rule. Published results keep their own copy. */
export async function setSubjectCore(subjectId: string, isCore: boolean, actor: Actor): Promise<Fail | { ok: true }> {
  if (!isObjectIdOrHexString(subjectId)) return { ok: false, error: "Subject not found" };
  const { institutionId } = actor;
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const row = await Subject.findOneAndUpdate({ _id: subjectId, institutionId, status: "ACTIVE" }, { $set: { isCore } }, { new: false, ...(txn ? { session: txn } : {}) });
    if (!row) return false;
    await audit(actor, "SUBJECT_UPDATED", "Subject", subjectId, { isCoreBefore: Boolean(row.isCore), isCoreAfter: isCore }, txn);
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "Subject not found" };
}

export async function mapSubjectToClass(input: unknown, actor: Actor): Promise<Fail | { ok: true }> {
  const parsed = classSubjectInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid mapping" };
  const { institutionId } = actor;
  const { gradeLevelId, subjectId, defaultMaxMarks } = parsed.data;
  const [level, subject] = await Promise.all([
    GradeLevel.exists({ _id: gradeLevelId, institutionId }),
    Subject.exists({ _id: subjectId, institutionId, status: "ACTIVE" }),
  ]);
  if (!level) return { ok: false, error: "Class not found" };
  if (!subject) return { ok: false, error: "Subject not found" };
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      await ClassSubject.updateOne({ institutionId, gradeLevelId, subjectId }, { $set: { defaultMaxMarks }, $setOnInsert: { institutionId } }, { upsert: true, ...(txn ? { session: txn } : {}) });
      await audit(actor, "CLASS_SUBJECT_MAPPED", "ClassSubject", `${gradeLevelId}:${subjectId}`, { gradeLevelId, subjectId, defaultMaxMarks }, txn);
    });
  } catch (e) {
    if (!isDup(e)) throw e; // two simultaneous upserts: the row exists either way
  }
  return { ok: true };
}

export async function unmapSubjectFromClass(gradeLevelId: string, subjectId: string, actor: Actor): Promise<Fail | { ok: true }> {
  if (!isObjectIdOrHexString(gradeLevelId) || !isObjectIdOrHexString(subjectId)) return { ok: false, error: "Mapping not found" };
  const { institutionId } = actor;
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const res = await ClassSubject.deleteOne({ institutionId, gradeLevelId, subjectId }, txn ? { session: txn } : {});
    if (!res.deletedCount) return false;
    await audit(actor, "CLASS_SUBJECT_UNMAPPED", "ClassSubject", `${gradeLevelId}:${subjectId}`, { gradeLevelId, subjectId }, txn);
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "Mapping not found" };
}
