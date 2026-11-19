import "server-only";
import mongoose, { isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import {
  enrollmentInputSchema,
  guardianLinkInputSchema,
  parseCsv,
  studentInputSchema,
  validateStudentImport,
} from "@schoolos/core";
import {
  AcademicYear,
  AuditEvent,
  Enrollment,
  GradeLevel,
  Guardian,
  Section,
  Student,
  withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";

type Fail = { ok: false; error: string };
type GuardianInput = { fullName: string; phone: string; relationship: string; email?: string; isPrimary: boolean };
type ImportRow = {
  line: number;
  data: { studentNumber: string; firstName: string; lastName: string; dateOfBirth?: string; guardian?: GuardianInput };
};
const isDuplicate = (e: unknown) => (e as { code?: number }).code === 11000;
const MAX_CSV_CHARS = 1_000_000;

// School days are Asia/Dhaka (UTC+6, no DST).
export const todayInDhaka = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function audit(actor: Actor, action: string, entityId: unknown, metadata: Record<string, unknown>, txn: ClientSession | null) {
  await AuditEvent.create(
    [{ institutionId: actor.institutionId, actorMembershipId: actor.membershipId, action, entityType: "Student", entityId: String(entityId), metadata }],
    txn ? { session: txn } : {},
  );
}

// No foreign keys in Mongo: the section must belong to this school AND be in its current year.
async function resolveEnrollableSection(institutionId: unknown, sectionId: string) {
  if (!isObjectIdOrHexString(sectionId)) return { ok: false, error: "Invalid section" } as Fail;
  const section = (await Section.findOne({ _id: sectionId, institutionId, status: "ACTIVE" }).lean()) as unknown as { _id: unknown; academicYearId: unknown } | null;
  if (!section) return { ok: false, error: "Section not found" } as Fail;
  const current = await AcademicYear.exists({ _id: section.academicYearId, institutionId, isCurrent: true });
  if (!current) return { ok: false, error: "Section is not in the current academic year" } as Fail;
  return { ok: true, section } as const;
}

// Enrollment is the source of truth; Student.sectionId is updated in the SAME transaction.
async function enrollInTxn(
  studentId: unknown,
  section: { _id: unknown; academicYearId: unknown },
  actor: Actor,
  txn: ClientSession | null,
) {
  const { institutionId } = actor;
  const opts = txn ? { session: txn } : {};
  const existing = (await Enrollment.findOne({ institutionId, studentId, academicYearId: section.academicYearId }, null, opts).lean()) as unknown as
    | { _id: unknown; sectionId: unknown; status: string }
    | null;
  if (existing && existing.status === "ACTIVE" && String(existing.sectionId) === String(section._id)) return "unchanged" as const;
  if (existing) {
    await Enrollment.updateOne({ _id: existing._id, institutionId }, { $set: { sectionId: section._id, status: "ACTIVE" } }, opts);
    await audit(actor, "STUDENT_TRANSFERRED", studentId, { fromSectionId: String(existing.sectionId), toSectionId: String(section._id) }, txn);
  } else {
    await Enrollment.create([{ institutionId, studentId, sectionId: section._id, academicYearId: section.academicYearId, startsOn: todayInDhaka() }], opts);
    await audit(actor, "STUDENT_ENROLLED", studentId, { sectionId: String(section._id) }, txn);
  }
  await Student.updateOne({ _id: studentId, institutionId }, { $set: { sectionId: section._id } }, opts);
  return "changed" as const;
}

async function linkGuardianInTxn(studentId: unknown, input: GuardianInput, actor: Actor, txn: ClientSession | null) {
  const { institutionId } = actor;
  const opts = txn ? { session: txn } : {};
  const already = await Guardian.countDocuments({ institutionId, "studentLinks.studentId": studentId }, opts);
  const link = { studentId, relationship: input.relationship, isPrimary: input.isPrimary || already === 0 };
  const existing = (await Guardian.findOne({ institutionId, phone: input.phone }, null, opts).lean()) as unknown as { _id: unknown } | null;
  if (existing) {
    await Guardian.updateOne(
      { _id: existing._id, institutionId, "studentLinks.studentId": { $ne: studentId } },
      { $push: { studentLinks: link } },
      opts,
    );
    return existing._id;
  }
  const [created] = await Guardian.create(
    [{ institutionId, fullName: input.fullName, phone: input.phone, email: input.email, studentLinks: [link] }],
    opts,
  );
  return created._id;
}

export async function createStudent(input: unknown, sectionId: string | undefined, actor: Actor): Promise<Fail | { ok: true; id: string }> {
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid student" };
  const { guardian, dateOfBirth, ...data } = parsed.data;
  const { institutionId } = actor;
  let target: { _id: unknown; academicYearId: unknown } | null = null;
  if (sectionId) {
    const resolved = await resolveEnrollableSection(institutionId, sectionId);
    if (!resolved.ok) return resolved;
    target = resolved.section;
  }
  try {
    const id = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const [student] = await Student.create(
        [{ ...data, institutionId, ...(dateOfBirth ? { dateOfBirth: new Date(`${dateOfBirth}T00:00:00Z`) } : {}) }],
        opts,
      );
      if (guardian) await linkGuardianInTxn(student._id, guardian, actor, txn);
      if (target) await enrollInTxn(student._id, target, actor, txn);
      await audit(actor, "STUDENT_CREATED", student._id, { studentNumber: data.studentNumber }, txn);
      return String(student._id);
    });
    return { ok: true, id };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "That student number already exists" };
    throw e;
  }
}

export async function enrollStudent(input: unknown, actor: Actor): Promise<Fail | { ok: true; changed: boolean }> {
  const parsed = enrollmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid enrollment" };
  const { institutionId } = actor;
  const student = await Student.exists({ _id: parsed.data.studentId, institutionId, status: "ACTIVE" });
  if (!student) return { ok: false, error: "Student not found" };
  const resolved = await resolveEnrollableSection(institutionId, parsed.data.sectionId);
  if (!resolved.ok) return resolved;
  try {
    const result = await withOptionalTransaction((txn: ClientSession | null) => enrollInTxn(parsed.data.studentId, resolved.section, actor, txn));
    return { ok: true, changed: result === "changed" };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "Enrollment changed meanwhile. Reload and retry." };
    throw e;
  }
}

export async function addGuardian(input: unknown, actor: Actor): Promise<Fail | { ok: true }> {
  const parsed = guardianLinkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid guardian" };
  const { institutionId } = actor;
  // Guardian links may only point at a student of THIS school.
  if (!(await Student.exists({ _id: parsed.data.studentId, institutionId }))) return { ok: false, error: "Student not found" };
  await withOptionalTransaction(async (txn: ClientSession | null) => {
    await linkGuardianInTxn(parsed.data.studentId, parsed.data.guardian, actor, txn);
    await audit(actor, "GUARDIAN_LINKED", parsed.data.studentId, { relationship: parsed.data.guardian.relationship }, txn);
  });
  return { ok: true };
}

export async function listStudents(institutionId: unknown, opts: { q?: string; sectionId?: string; page?: number }) {
  const q = (opts.q ?? "").trim().slice(0, 60);
  const filter: Record<string, unknown> = { institutionId };
  if (q) {
    const prefix = new RegExp(`^${escapeRegex(q)}`, "i");
    filter.$or = [{ studentNumber: q }, { firstName: prefix }, { lastName: prefix }];
  }
  if (opts.sectionId && isObjectIdOrHexString(opts.sectionId)) filter.sectionId = opts.sectionId;
  const pageSize = 25;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [rows, total] = await Promise.all([
    Student.find(filter).sort({ lastName: 1, firstName: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Student.countDocuments(filter),
  ]);
  return { rows: rows as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName: string; sectionId?: unknown; status: string }>, total, page, pageSize };
}

export async function getStudentProfile(institutionId: unknown, studentId: string) {
  if (!isObjectIdOrHexString(studentId)) return null;
  const student = (await Student.findOne({ _id: studentId, institutionId }).lean()) as unknown as
    | { _id: unknown; studentNumber: string; firstName: string; lastName: string; dateOfBirth?: Date; sectionId?: unknown; status: string }
    | null;
  if (!student) return null;
  const [guardians, enrollments] = await Promise.all([
    Guardian.find({ institutionId, "studentLinks.studentId": studentId }).lean(),
    Enrollment.find({ institutionId, studentId }).sort({ startsOn: -1 }).lean(),
  ]);
  return {
    student,
    guardians: guardians as unknown as Array<{ _id: unknown; fullName: string; phone?: string; email?: string; studentLinks: Array<{ studentId: unknown; relationship: string; isPrimary: boolean }> }>,
    enrollments: enrollments as unknown as Array<{ _id: unknown; sectionId: unknown; academicYearId: unknown; startsOn: string; status: string }>,
  };
}

export type ImportReport = {
  ok: true;
  committed: boolean;
  total: number;
  validCount: number;
  errors: Array<{ line: number; message: string }>;
  preview: Array<{ line: number; studentNumber: string; name: string; guardian?: string }>;
};

// Stateless two-step import: preview (dry run) and commit both re-parse the same text,
// so nothing unvalidated is ever stored between steps. Only error-free rows are committed.
export async function importStudents(
  csvText: string,
  opts: { sectionId?: string; commit: boolean },
  actor: Actor,
): Promise<Fail | ImportReport> {
  if (typeof csvText !== "string" || csvText.length > MAX_CSV_CHARS) return { ok: false, error: "File is too large (max 1 MB)" };
  const { institutionId } = actor;
  const checked = validateStudentImport(parseCsv(csvText)) as { rows: ImportRow[]; errors: Array<{ line: number; message: string }>; total: number; fatal?: string };
  if (checked.fatal) return { ok: false, error: checked.fatal };

  let target: { _id: unknown; academicYearId: unknown } | null = null;
  if (opts.sectionId) {
    const resolved = await resolveEnrollableSection(institutionId, opts.sectionId);
    if (!resolved.ok) return resolved;
    target = resolved.section;
  }

  const errors = [...checked.errors];
  const numbers = checked.rows.map((r) => r.data.studentNumber);
  const taken = new Set(
    ((await Student.find({ institutionId, studentNumber: { $in: numbers } }).select("studentNumber").lean()) as unknown as Array<{ studentNumber: string }>).map((s) => s.studentNumber),
  );
  const valid = checked.rows.filter((r) => {
    if (!taken.has(r.data.studentNumber)) return true;
    errors.push({ line: r.line, message: `studentNumber: ${r.data.studentNumber} already exists` });
    return false;
  });
  errors.sort((a, b) => a.line - b.line);

  const report: ImportReport = {
    ok: true,
    committed: false,
    total: checked.total,
    validCount: valid.length,
    errors,
    preview: valid.slice(0, 20).map((r) => ({
      line: r.line,
      studentNumber: r.data.studentNumber,
      name: `${r.data.firstName} ${r.data.lastName}`,
      guardian: r.data.guardian?.fullName,
    })),
  };
  if (!opts.commit) return report;
  if (!valid.length) return { ok: false, error: "No valid rows to import" };

  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const o = txn ? { session: txn } : {};
      const prepared = valid.map((r) => ({ id: new mongoose.Types.ObjectId(), data: r.data }));
      await Student.insertMany(
        prepared.map(({ id, data }) => ({
          _id: id,
          institutionId,
          studentNumber: data.studentNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          ...(data.dateOfBirth ? { dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`) } : {}),
          ...(target ? { sectionId: target._id } : {}),
        })),
        o,
      );

      // Siblings share one Guardian per phone, in this file and in the database.
      const byPhone = new Map<string, { input: GuardianInput; studentIds: unknown[]; relationships: string[] }>();
      for (const { id, data } of prepared) {
        if (!data.guardian) continue;
        const entry = byPhone.get(data.guardian.phone) ?? { input: data.guardian, studentIds: [], relationships: [] };
        entry.studentIds.push(id);
        entry.relationships.push(data.guardian.relationship);
        byPhone.set(data.guardian.phone, entry);
      }
      if (byPhone.size) {
        const existing = (await Guardian.find({ institutionId, phone: { $in: [...byPhone.keys()] } }, null, o).lean()) as unknown as Array<{ _id: unknown; phone: string }>;
        const existingByPhone = new Map(existing.map((g) => [g.phone, g._id]));
        const fresh: Array<Record<string, unknown>> = [];
        for (const [phone, entry] of byPhone) {
          const links = entry.studentIds.map((studentId, i) => ({ studentId, relationship: entry.relationships[i], isPrimary: true }));
          const existingId = existingByPhone.get(phone);
          if (existingId) {
            await Guardian.updateOne({ _id: existingId, institutionId }, { $push: { studentLinks: { $each: links } } }, o);
          } else {
            fresh.push({ institutionId, fullName: entry.input.fullName, phone, email: entry.input.email, studentLinks: links });
          }
        }
        if (fresh.length) await Guardian.insertMany(fresh, o);
      }

      if (target) {
        const startsOn = todayInDhaka();
        await Enrollment.insertMany(
          prepared.map(({ id }) => ({ institutionId, studentId: id, sectionId: target!._id, academicYearId: target!.academicYearId, startsOn })),
          o,
        );
      }
      await AuditEvent.create(
        [{
          institutionId,
          actorMembershipId: actor.membershipId,
          action: "STUDENTS_IMPORTED",
          entityType: "Student",
          entityId: "import",
          metadata: { imported: prepared.length, skipped: errors.length, sectionId: opts.sectionId },
        }],
        o,
      );
    });
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "Some student numbers were added meanwhile. Run the preview again." };
    throw e;
  }
  return { ...report, committed: true };
}

export async function listCurrentSections(institutionId: unknown) {
  const years = (await AcademicYear.find({ institutionId, isCurrent: true }).lean()) as unknown as Array<{ _id: unknown }>;
  if (!years.length) return [];
  // No populate(): it would query GradeLevel without institutionId, which the tenant plugin rejects.
  const [sections, levels] = await Promise.all([
    Section.find({ institutionId, academicYearId: years[0]._id, status: "ACTIVE" }).sort({ name: 1 }).lean() as unknown as Promise<Array<{ _id: unknown; name: string; gradeLevelId: unknown }>>,
    GradeLevel.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
  ]);
  const levelName = new Map(levels.map((l) => [String(l._id), l.name]));
  return sections.map((s) => ({ id: String(s._id), label: `${levelName.get(String(s.gradeLevelId)) ?? "Class"} – ${s.name}` }));
}
