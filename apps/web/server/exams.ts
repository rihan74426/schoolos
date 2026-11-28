import "server-only";
import { Types, isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import {
  assessmentUpdateSchema, can, examInputSchema, examStatusFromSheets, markError, passOverrideSchema, saveMarksSchema, sheetReturnSchema,
} from "@schoolos/core";
import {
  AcademicYear, Assessment, AuditEvent, ClassSubject, Exam, GradeLevel, MarkCorrection, MarkSheet, Section, Student, Subject, TeachingAssignment, withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";

export type Fail = { ok: false; error: string };
export class Stale extends Error {}
export const isDup = (e: unknown) => (e as { code?: number }).code === 11000;
export const idOk = (v: unknown): v is string => typeof v === "string" && isObjectIdOrHexString(v);
export const fullName = (s: { firstName: string; lastName?: string }) => [s.firstName, s.lastName].filter(Boolean).join(" ");

export type Entry = { studentId: unknown; status: "PRESENT" | "ABSENT" | "EXEMPT"; marks?: number };
export type ExamDoc = {
  _id: unknown; name: string; term?: string; academicYearId: unknown; gradeLevelId: unknown; status: "DRAFT" | "ENTRY" | "SUBMITTED" | "APPROVED" | "PUBLISHED";
  passRule: "ALL_SUBJECTS" | "CORE_ONLY"; passOverrides: Array<{ studentId: unknown; reason: string }>; resultVersion: number; publishedAt?: Date;
};
export type AssessmentDoc = { _id: unknown; examId: unknown; sectionId: unknown; subjectId: unknown; maxMarks: number; date?: string };
export type SheetDoc = { _id: unknown; examId: unknown; assessmentId: unknown; sectionId: unknown; subjectId: unknown; status: "ENTRY" | "SUBMITTED" | "APPROVED"; entries: Entry[]; returnReason?: string; submittedAt?: Date; submittedByMembershipId?: unknown };

export async function audit(actor: Actor, action: string, entityType: string, entityId: unknown, metadata: Record<string, unknown>, txn: ClientSession | null) {
  await AuditEvent.create([{ institutionId: actor.institutionId, actorMembershipId: actor.membershipId, action, entityType, entityId: String(entityId), metadata }], txn ? { session: txn } : {});
}

/** Teachers enter marks only for a section AND subject they are assigned to; coordinators/leadership for any. */
export async function canEnterAssessment(actor: Actor, a: { sectionId: unknown; subjectId: unknown }) {
  if (!can(actor.role, "exams:enter")) return false;
  if (can(actor.role, "exams:any-section")) return true;
  return Boolean(await TeachingAssignment.exists({ institutionId: actor.institutionId, membershipId: actor.membershipId, sectionId: a.sectionId, subjectId: a.subjectId, status: "ACTIVE" }));
}

async function loadAssessment(institutionId: unknown, assessmentId: string) {
  if (!idOk(assessmentId)) return null;
  const assessment = (await Assessment.findOne({ _id: assessmentId, institutionId }).lean()) as unknown as AssessmentDoc | null;
  if (!assessment) return null;
  const exam = (await Exam.findOne({ _id: assessment.examId, institutionId }).lean()) as unknown as ExamDoc | null;
  const sheet = (await MarkSheet.findOne({ institutionId, assessmentId }).lean()) as unknown as SheetDoc | null;
  return exam ? { assessment, exam, sheet } : null;
}

/** Exam status follows its sheets until publish (all submitted -> SUBMITTED, all approved -> APPROVED, any open -> ENTRY). */
async function syncExamStatus(institutionId: unknown, examId: unknown, txn: ClientSession | null) {
  const opts = txn ? { session: txn } : {};
  const sheets = (await MarkSheet.find({ institutionId, examId }, "status", opts).lean()) as unknown as Array<{ status: string }>;
  await Exam.updateOne({ _id: examId, institutionId, status: { $in: ["ENTRY", "SUBMITTED", "APPROVED"] } }, { $set: { status: examStatusFromSheets(sheets.map((s) => s.status)) } }, opts);
}

// ---------- setup ----------

/** Creates a DRAFT exam with one assessment per section x mapped subject of the class. */
export async function createExam(input: unknown, actor: Actor): Promise<Fail | { ok: true; id: string; assessments: number }> {
  const parsed = examInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid exam" };
  const { institutionId } = actor;
  const { name, term, academicYearId, gradeLevelId, passRule } = parsed.data;
  const [year, level] = await Promise.all([AcademicYear.exists({ _id: academicYearId, institutionId }), GradeLevel.exists({ _id: gradeLevelId, institutionId })]);
  if (!year) return { ok: false, error: "Academic year not found" };
  if (!level) return { ok: false, error: "Class not found" };
  const [sections, mappings] = await Promise.all([
    Section.find({ institutionId, academicYearId, gradeLevelId, status: "ACTIVE" }).lean() as unknown as Promise<Array<{ _id: unknown }>>,
    ClassSubject.find({ institutionId, gradeLevelId }).lean() as unknown as Promise<Array<{ subjectId: unknown; defaultMaxMarks: number }>>,
  ]);
  if (!sections.length) return { ok: false, error: "This class has no sections in that year yet" };
  const live = new Set(((await Subject.find({ institutionId, status: "ACTIVE", _id: { $in: mappings.map((m) => m.subjectId) } }).distinct("_id")) as unknown[]).map(String));
  const subjects = mappings.filter((m) => live.has(String(m.subjectId)));
  if (!subjects.length) return { ok: false, error: "Map subjects to this class in Settings first" };

  const docs = (examId: unknown) => sections.flatMap((s) => subjects.map((m) => ({ institutionId, examId, sectionId: s._id, subjectId: m.subjectId, maxMarks: m.defaultMaxMarks })));
  let examId: unknown;
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const [exam] = await Exam.create([{ institutionId, name, term, academicYearId, gradeLevelId, passRule, createdByMembershipId: actor.membershipId }], opts);
      examId = exam._id;
      await Assessment.insertMany(docs(exam._id), opts);
      await audit(actor, "EXAM_CREATED", "Exam", exam._id, { name, term, passRule, assessments: sections.length * subjects.length }, txn);
    });
  } catch (e) {
    if (examId) { // standalone Mongo has no rollback: remove partial writes (a no-op when the transaction aborted)
      await Assessment.deleteMany({ institutionId, examId });
      await Exam.deleteOne({ _id: examId, institutionId });
    }
    if (isDup(e)) return { ok: false, error: "An exam with this name already exists for that class and year" };
    throw e;
  }
  return { ok: true, id: String(examId), assessments: sections.length * subjects.length };
}

export async function updateAssessment(input: unknown, actor: Actor): Promise<Fail | { ok: true }> {
  const parsed = assessmentUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid paper" };
  const { institutionId } = actor;
  const ctx = await loadAssessment(institutionId, parsed.data.assessmentId);
  if (!ctx) return { ok: false, error: "Paper not found" };
  if (ctx.exam.status !== "DRAFT") return { ok: false, error: "Full marks can only change while the exam is a draft" };
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const res = await Assessment.updateOne({ _id: ctx.assessment._id, institutionId }, { $set: { maxMarks: parsed.data.maxMarks, ...(parsed.data.date ? { date: parsed.data.date } : {}) } }, txn ? { session: txn } : {});
    if (!res.matchedCount) return false;
    await audit(actor, "ASSESSMENT_UPDATED", "Assessment", ctx.assessment._id, { before: { maxMarks: ctx.assessment.maxMarks, date: ctx.assessment.date }, after: { maxMarks: parsed.data.maxMarks, date: parsed.data.date } }, txn);
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "Paper not found" };
}

/** DRAFT -> ENTRY: creates an empty mark sheet per paper so teachers can start. */
export async function openExam(examId: string, actor: Actor): Promise<Fail | { ok: true }> {
  if (!idOk(examId)) return { ok: false, error: "Exam not found" };
  const { institutionId } = actor;
  const assessments = (await Assessment.find({ institutionId, examId }).lean()) as unknown as AssessmentDoc[];
  if (!assessments.length) return { ok: false, error: "Exam has no papers" };
  let claimed = false;
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const res = await Exam.updateOne({ _id: examId, institutionId, status: "DRAFT" }, { $set: { status: "ENTRY" } }, opts);
      if (!res.modifiedCount) throw new Stale();
      claimed = true;
      await MarkSheet.insertMany(assessments.map((a) => ({ institutionId, examId, assessmentId: a._id, sectionId: a.sectionId, subjectId: a.subjectId })), opts);
      await audit(actor, "EXAM_OPENED", "Exam", examId, { sheets: assessments.length }, txn);
    });
  } catch (e) {
    if (e instanceof Stale) return { ok: false, error: "Exam not found or already open" };
    if (claimed) { await MarkSheet.deleteMany({ institutionId, examId }); await Exam.updateOne({ _id: examId, institutionId, status: "ENTRY" }, { $set: { status: "DRAFT" } }); } // standalone Mongo: undo
    throw e;
  }
  return { ok: true };
}

/** Exam controller picks how pass/fail is decided. Not allowed once published. */
export async function updateExamRules(examId: string, passRule: string, actor: Actor): Promise<Fail | { ok: true }> {
  if (!idOk(examId)) return { ok: false, error: "Exam not found" };
  if (passRule !== "ALL_SUBJECTS" && passRule !== "CORE_ONLY") return { ok: false, error: "Unknown pass rule" };
  const { institutionId } = actor;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam) return { ok: false, error: "Exam not found" };
  if (exam.status === "PUBLISHED") return { ok: false, error: "Published results cannot change the pass rule" };
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const res = await Exam.updateOne({ _id: examId, institutionId, status: { $ne: "PUBLISHED" } }, { $set: { passRule } }, txn ? { session: txn } : {});
    if (!res.matchedCount) return false;
    await audit(actor, "EXAM_RULE_CHANGED", "Exam", examId, { before: exam.passRule, after: passRule }, txn);
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "Published results cannot change the pass rule" };
}

/** Exam controller passes a named student despite the rule (or removes that decision). Reason required, audited. */
export async function setPassOverride(input: unknown, actor: Actor): Promise<Fail | { ok: true }> {
  const parsed = passOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { institutionId } = actor;
  const { examId, studentId, reason, remove } = parsed.data;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam) return { ok: false, error: "Exam not found" };
  if (exam.status === "DRAFT" || exam.status === "PUBLISHED") return { ok: false, error: exam.status === "DRAFT" ? "Open the exam first" : "Published results cannot be overridden" };
  if (!(await MarkSheet.exists({ institutionId, examId, "entries.studentId": studentId }))) return { ok: false, error: "That student has no marks in this exam" };
  const rest = exam.passOverrides.filter((o) => String(o.studentId) !== studentId);
  const next = remove ? rest : [...rest, { studentId, reason, byMembershipId: actor.membershipId, at: new Date() }];
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const res = await Exam.updateOne({ _id: examId, institutionId, status: { $nin: ["DRAFT", "PUBLISHED"] } }, { $set: { passOverrides: next } }, txn ? { session: txn } : {});
    if (!res.matchedCount) return false;
    await audit(actor, remove ? "PASS_OVERRIDE_REMOVED" : "PASS_OVERRIDE_SET", "Exam", examId, { studentId, reason }, txn);
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "The exam changed while saving. Reload and try again." };
}

// ---------- marks entry ----------

async function rosterFor(institutionId: unknown, sectionId: unknown, extraIds: unknown[] = []) {
  const active = (await Student.find({ institutionId, sectionId, status: "ACTIVE" }).sort({ studentNumber: 1 }).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>;
  const known = new Set(active.map((s) => String(s._id)));
  const missing = extraIds.filter((id) => !known.has(String(id)));
  const extra = missing.length ? ((await Student.find({ institutionId, _id: { $in: missing } }).lean()) as unknown as typeof active) : [];
  return { active, all: [...active, ...extra] };
}

export async function getMarkSheet(actor: Actor, assessmentId: string) {
  const { institutionId } = actor;
  const ctx = await loadAssessment(institutionId, assessmentId);
  if (!ctx?.sheet || !(await canEnterAssessment(actor, ctx.assessment))) return null;
  const { assessment, exam, sheet } = ctx;
  const [roster, subject, section] = await Promise.all([
    rosterFor(institutionId, assessment.sectionId, sheet.entries.map((e) => e.studentId)),
    Subject.findOne({ _id: assessment.subjectId, institutionId }).lean() as unknown as Promise<{ name: string; code: string } | null>,
    Section.findOne({ _id: assessment.sectionId, institutionId }).lean() as unknown as Promise<{ name: string } | null>,
  ]);
  const entries = new Map(sheet.entries.map((e) => [String(e.studentId), e]));
  return {
    exam: { id: String(exam._id), name: exam.name, status: exam.status },
    paper: { id: String(assessment._id), maxMarks: assessment.maxMarks, date: assessment.date ?? null, subject: subject?.name ?? "—", section: section?.name ?? "—" },
    sheet: { status: sheet.status, returnReason: sheet.returnReason ?? null },
    canEdit: sheet.status === "ENTRY" && exam.status === "ENTRY",
    canCorrect: exam.status === "PUBLISHED",
    students: roster.all.map((s) => ({ id: String(s._id), number: s.studentNumber, name: fullName(s), status: entries.get(String(s._id))?.status ?? null, marks: entries.get(String(s._id))?.marks ?? null })),
  };
}

/** Save (or update) marks while the sheet is open. Partial saves are fine; submit needs every student. */
export async function saveMarks(input: unknown, actor: Actor): Promise<Fail | { ok: true; saved: number }> {
  const parsed = saveMarksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid marks" };
  const { institutionId } = actor;
  const ctx = await loadAssessment(institutionId, parsed.data.assessmentId);
  if (!ctx?.sheet || !(await canEnterAssessment(actor, ctx.assessment))) return { ok: false, error: "You are not assigned to this subject and section" };
  if (ctx.exam.status !== "ENTRY" || ctx.sheet.status !== "ENTRY") return { ok: false, error: "This sheet is locked. Marks can no longer be changed here." };
  const active = new Set(((await Student.find({ institutionId, sectionId: ctx.assessment.sectionId, status: "ACTIVE" }).distinct("_id")) as unknown[]).map(String));
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const e of parsed.data.entries) {
    if (!active.has(e.studentId)) return { ok: false, error: "A student in the list is not in this section" };
    if (seen.has(e.studentId)) return { ok: false, error: "A student appears twice" };
    seen.add(e.studentId);
    if (e.status === "PRESENT") {
      const err = markError(e.marks as number, ctx.assessment.maxMarks);
      if (err) return { ok: false, error: err };
      entries.push({ studentId: e.studentId, status: "PRESENT", marks: e.marks });
    } else {
      entries.push({ studentId: e.studentId, status: e.status as Entry["status"] });
    }
  }
  const res = await MarkSheet.updateOne({ institutionId, assessmentId: ctx.assessment._id, status: "ENTRY" }, { $set: { entries } });
  return res.matchedCount ? { ok: true, saved: entries.length } : { ok: false, error: "This sheet was locked while you were saving." };
}

async function missingStudents(institutionId: unknown, sheet: SheetDoc) {
  const have = new Set(sheet.entries.map((e) => String(e.studentId)));
  const active = (await Student.find({ institutionId, sectionId: sheet.sectionId, status: "ACTIVE" }).select("_id").lean()) as unknown as Array<{ _id: unknown }>;
  return { total: active.length, missing: active.filter((s) => !have.has(String(s._id))).length };
}

export async function submitSheet(assessmentId: string, actor: Actor): Promise<Fail | { ok: true }> {
  const { institutionId } = actor;
  const ctx = await loadAssessment(institutionId, assessmentId);
  if (!ctx?.sheet || !(await canEnterAssessment(actor, ctx.assessment))) return { ok: false, error: "You are not assigned to this subject and section" };
  if (ctx.exam.status !== "ENTRY" || ctx.sheet.status !== "ENTRY") return { ok: false, error: "This sheet is already submitted or locked" };
  const { total, missing } = await missingStudents(institutionId, ctx.sheet);
  if (missing) return { ok: false, error: `${missing} student(s) still have no marks. Enter marks, Absent or Exempt for everyone.` };
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const res = await MarkSheet.updateOne({ institutionId, assessmentId, status: "ENTRY" }, { $set: { status: "SUBMITTED", submittedByMembershipId: actor.membershipId, submittedAt: new Date() }, $unset: { returnReason: 1 } }, opts);
      if (!res.modifiedCount) throw new Stale();
      await syncExamStatus(institutionId, ctx.exam._id, txn);
      await audit(actor, "SHEET_SUBMITTED", "MarkSheet", ctx.sheet!._id, { assessmentId, students: total }, txn);
    });
  } catch (e) {
    if (e instanceof Stale) return { ok: false, error: "This sheet was already submitted" };
    throw e;
  }
  return { ok: true };
}

// ---------- approval ----------

export async function approveSheet(assessmentId: string, actor: Actor): Promise<Fail | { ok: true }> {
  const { institutionId } = actor;
  const ctx = await loadAssessment(institutionId, assessmentId);
  if (!ctx?.sheet) return { ok: false, error: "Sheet not found" };
  if (ctx.exam.status === "PUBLISHED" || ctx.exam.status === "DRAFT") return { ok: false, error: "This exam is not in review" };
  if (ctx.sheet.submittedByMembershipId && String(ctx.sheet.submittedByMembershipId) === String(actor.membershipId)) return { ok: false, error: "You submitted this sheet. Someone else must approve it." };
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const res = await MarkSheet.updateOne({ institutionId, assessmentId, status: "SUBMITTED", submittedByMembershipId: { $ne: actor.membershipId } }, { $set: { status: "APPROVED", approvedByMembershipId: actor.membershipId, approvedAt: new Date() } }, opts);
      if (!res.modifiedCount) throw new Stale();
      await syncExamStatus(institutionId, ctx.exam._id, txn);
      await audit(actor, "SHEET_APPROVED", "MarkSheet", ctx.sheet!._id, { assessmentId }, txn);
    });
  } catch (e) {
    if (e instanceof Stale) return { ok: false, error: "Only submitted sheets can be approved" };
    throw e;
  }
  return { ok: true };
}

export async function returnSheet(input: unknown, actor: Actor): Promise<Fail | { ok: true }> {
  const parsed = sheetReturnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { institutionId } = actor;
  const { assessmentId, reason } = parsed.data;
  const ctx = await loadAssessment(institutionId, assessmentId);
  if (!ctx?.sheet) return { ok: false, error: "Sheet not found" };
  if (ctx.exam.status === "PUBLISHED" || ctx.exam.status === "DRAFT") return { ok: false, error: "Published results change only through an approved correction" };
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const res = await MarkSheet.updateOne({ institutionId, assessmentId, status: { $in: ["SUBMITTED", "APPROVED"] } }, { $set: { status: "ENTRY", returnReason: reason } }, opts);
      if (!res.modifiedCount) throw new Stale();
      await syncExamStatus(institutionId, ctx.exam._id, txn);
      await audit(actor, "SHEET_RETURNED", "MarkSheet", ctx.sheet!._id, { assessmentId, reason, from: ctx.sheet!.status }, txn);
    });
  } catch (e) {
    if (e instanceof Stale) return { ok: false, error: "Only submitted or approved sheets can be sent back" };
    throw e;
  }
  return { ok: true };
}

// ---------- reads ----------

export async function listExams(actor: Actor) {
  const { institutionId } = actor;
  const [exams, years, levels, sheets] = await Promise.all([
    Exam.find({ institutionId }).sort({ createdAt: -1 }).limit(100).lean() as unknown as Promise<ExamDoc[]>,
    AcademicYear.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
    GradeLevel.find({ institutionId }).sort({ sortOrder: 1 }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
    MarkSheet.aggregate([{ $match: { institutionId: new Types.ObjectId(String(institutionId)) } }, { $group: { _id: { e: "$examId", s: "$status" }, n: { $sum: 1 } } }]) as Promise<Array<{ _id: { e: unknown; s: string }; n: number }>>,
  ]);
  const y = new Map(years.map((r) => [String(r._id), r.name]));
  const l = new Map(levels.map((r) => [String(r._id), r.name]));
  const counts = new Map<string, Record<string, number>>();
  for (const r of sheets) counts.set(String(r._id.e), { ...(counts.get(String(r._id.e)) ?? {}), [r._id.s]: r.n });
  return {
    years: years.map((r) => ({ id: String(r._id), name: r.name })),
    levels: levels.map((r) => ({ id: String(r._id), name: r.name })),
    exams: exams.map((e) => ({ id: String(e._id), name: e.name, term: e.term ?? "", status: e.status, passRule: e.passRule, year: y.get(String(e.academicYearId)) ?? "—", level: l.get(String(e.gradeLevelId)) ?? "—", sheets: counts.get(String(e._id)) ?? {}, resultVersion: e.resultVersion })),
  };
}

export async function getExamDetail(actor: Actor, examId: string) {
  if (!idOk(examId)) return null;
  const { institutionId } = actor;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam) return null;
  const [assessments, sheets, subjects, sections, pending] = await Promise.all([
    Assessment.find({ institutionId, examId }).lean() as unknown as Promise<AssessmentDoc[]>,
    MarkSheet.find({ institutionId, examId }).lean() as unknown as Promise<SheetDoc[]>,
    Subject.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string; code: string; isCore?: boolean }>>,
    Section.find({ institutionId, gradeLevelId: exam.gradeLevelId, academicYearId: exam.academicYearId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
    MarkCorrection.countDocuments({ institutionId, examId, status: "PENDING" }),
  ]);
  const subj = new Map(subjects.map((s) => [String(s._id), s]));
  const sec = new Map(sections.map((s) => [String(s._id), s.name]));
  const sheetBy = new Map(sheets.map((s) => [String(s.assessmentId), s]));
  // Student marks only reach the approval UI; teachers never need them here.
  const inReview = can(actor.role, "exams:publish") && exam.status !== "DRAFT" && exam.status !== "PUBLISHED";
  const entryIds = inReview ? [...new Set(sheets.flatMap((sh) => sh.entries.map((e) => String(e.studentId))))] : [];
  const entryStudents = entryIds.length ? ((await Student.find({ institutionId, _id: { $in: entryIds } }).sort({ studentNumber: 1 }).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>) : [];
  const ovIds = exam.passOverrides.map((o) => o.studentId);
  const ovStudents = ovIds.length ? ((await Student.find({ institutionId, _id: { $in: ovIds } }).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>) : [];
  const ovName = new Map(ovStudents.map((s) => [String(s._id), `${fullName(s)} (${s.studentNumber})`]));
  return {
    exam: { id: String(exam._id), name: exam.name, term: exam.term ?? "", status: exam.status, passRule: exam.passRule, resultVersion: exam.resultVersion },
    papers: assessments
      .map((a) => ({ id: String(a._id), section: sec.get(String(a.sectionId)) ?? "—", subject: subj.get(String(a.subjectId))?.name ?? "—", isCore: Boolean(subj.get(String(a.subjectId))?.isCore), maxMarks: a.maxMarks, date: a.date ?? null, sheetStatus: sheetBy.get(String(a._id))?.status ?? null, entered: sheetBy.get(String(a._id))?.entries.length ?? 0 }))
      .sort((x, y) => x.section.localeCompare(y.section) || x.subject.localeCompare(y.subject)),
    overrides: exam.passOverrides.map((o) => ({ studentId: String(o.studentId), student: ovName.get(String(o.studentId)) ?? "—", reason: o.reason })),
    pendingCorrections: pending,
    students: entryStudents.map((x) => ({ id: String(x._id), label: `${fullName(x)} (${x.studentNumber})` })),
  };
}

/** Adds papers for sections or subjects added after setup. Existing papers and marks are untouched. */
export async function syncPapers(examId: string, actor: Actor): Promise<Fail | { ok: true; added: number }> {
  if (!idOk(examId)) return { ok: false, error: "Exam not found" };
  const { institutionId } = actor;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam) return { ok: false, error: "Exam not found" };
  if (exam.status === "PUBLISHED") return { ok: false, error: "Published exams cannot change" };
  const { academicYearId, gradeLevelId } = exam;
  const [sections, mappings, existing] = await Promise.all([
    Section.find({ institutionId, academicYearId, gradeLevelId, status: "ACTIVE" }).lean() as unknown as Promise<Array<{ _id: unknown }>>,
    ClassSubject.find({ institutionId, gradeLevelId }).lean() as unknown as Promise<Array<{ subjectId: unknown; defaultMaxMarks: number }>>,
    Assessment.find({ institutionId, examId }, "sectionId subjectId").lean() as unknown as Promise<Array<{ sectionId: unknown; subjectId: unknown }>>,
  ]);
  const live = new Set(((await Subject.find({ institutionId, status: "ACTIVE", _id: { $in: mappings.map((m) => m.subjectId) } }).distinct("_id")) as unknown[]).map(String));
  const have = new Set(existing.map((a) => `${a.sectionId}:${a.subjectId}`));
  const docs = sections.flatMap((sec) => mappings.filter((m) => live.has(String(m.subjectId)) && !have.has(`${sec._id}:${m.subjectId}`)).map((m) => ({ institutionId, examId, sectionId: sec._id, subjectId: m.subjectId, maxMarks: m.defaultMaxMarks })));
  if (!docs.length) return { ok: true, added: 0 };
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const fresh = await Assessment.insertMany(docs, opts);
      if (exam.status !== "DRAFT") {
        await MarkSheet.insertMany(fresh.map((a: { _id: unknown; sectionId: unknown; subjectId: unknown }) => ({ institutionId, examId, assessmentId: a._id, sectionId: a.sectionId, subjectId: a.subjectId })), opts);
        await syncExamStatus(institutionId, examId, txn);
      }
      await audit(actor, "EXAM_PAPERS_SYNCED", "Exam", examId, { added: docs.length }, txn);
    });
  } catch (e) {
    if (isDup(e)) return { ok: false, error: "Papers changed while syncing. Reload and try again." };
    throw e;
  }
  return { ok: true, added: docs.length };
}

/** Sheets the actor may fill in (open exams only). */
export async function mySheets(actor: Actor) {
  if (!can(actor.role, "exams:enter")) return [];
  const { institutionId } = actor;
  const sheets = (await MarkSheet.find({ institutionId, status: "ENTRY" }).lean()) as unknown as SheetDoc[];
  const open = new Set(((await Exam.find({ institutionId, status: "ENTRY" }).distinct("_id")) as unknown[]).map(String));
  let rows = sheets.filter((s) => open.has(String(s.examId)));
  if (!can(actor.role, "exams:any-section")) {
    const mine = (await TeachingAssignment.find({ institutionId, membershipId: actor.membershipId, status: "ACTIVE", subjectId: { $exists: true } }).lean()) as unknown as Array<{ sectionId: unknown; subjectId: unknown }>;
    const keys = new Set(mine.map((m) => `${m.sectionId}:${m.subjectId}`));
    rows = rows.filter((s) => keys.has(`${s.sectionId}:${s.subjectId}`));
  }
  return decorateSheets(institutionId, rows);
}

export async function approvalQueue(institutionId: unknown) {
  const rows = (await MarkSheet.find({ institutionId, status: "SUBMITTED" }).sort({ submittedAt: 1 }).limit(200).lean()) as unknown as SheetDoc[];
  return decorateSheets(institutionId, rows);
}

async function decorateSheets(institutionId: unknown, rows: SheetDoc[]) {
  if (!rows.length) return [];
  const [exams, subjects, sections] = await Promise.all([
    Exam.find({ institutionId, _id: { $in: rows.map((r) => r.examId) } }).lean() as unknown as Promise<ExamDoc[]>,
    Subject.find({ institutionId, _id: { $in: rows.map((r) => r.subjectId) } }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
    Section.find({ institutionId, _id: { $in: rows.map((r) => r.sectionId) } }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
  ]);
  const e = new Map(exams.map((x) => [String(x._id), x.name]));
  const s = new Map(subjects.map((x) => [String(x._id), x.name]));
  const c = new Map(sections.map((x) => [String(x._id), x.name]));
  return rows.map((r) => ({ assessmentId: String(r.assessmentId), exam: e.get(String(r.examId)) ?? "—", subject: s.get(String(r.subjectId)) ?? "—", section: c.get(String(r.sectionId)) ?? "—", entered: r.entries.length, status: r.status, returnReason: r.returnReason ?? null, submittedAt: r.submittedAt?.toISOString() ?? null }));
}
