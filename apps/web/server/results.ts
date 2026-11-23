import "server-only";
import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { can, computeResult, correctionRequestSchema, gradingPresets, markError, reasonSchema, validateGradingScheme } from "@schoolos/core";
import {
  Assessment, AuditEvent, Exam, GradeLevel, GradingScheme, Institution, MarkCorrection, MarkSheet, ResultSnapshot, Section, Student, Subject, TeachingAssignment, withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";
import { audit, canEnterAssessment, fullName, idOk, isDup, Stale } from "./exams";
import type { AssessmentDoc, ExamDoc, Fail, SheetDoc } from "./exams";
import { getInstitutionPolicy } from "./policy";

type Scheme = ReturnType<typeof validateGradingScheme>;
type Row = Record<string, unknown> & { studentId: string; studentNumber: string; name: string; section: string; passed: boolean; grade: string; percent: number; gpa: number | null; totalMarks: number; totalMax: number };

/** The school's current default grading scheme (custom first, then preset). Frozen into each snapshot. */
export async function loadScheme(institutionId: unknown): Promise<Scheme | null> {
  const key = ((await getInstitutionPolicy(institutionId))?.policy as { gradingSchemeKey?: string } | undefined)?.gradingSchemeKey;
  if (!key) return null;
  const custom = await GradingScheme.findOne({ institutionId, key, status: "ACTIVE" }).lean();
  const raw = custom ?? gradingPresets[key as keyof typeof gradingPresets];
  return raw ? validateGradingScheme(raw) : null;
}

/** Everyone's result from the approved sheets. Fails (does not guess) if any student lacks a mark. */
async function buildResults(institutionId: unknown, exam: ExamDoc, scheme: Scheme, txn: ClientSession | null): Promise<Fail | { ok: true; results: Row[] }> {
  const opts = txn ? { session: txn } : {};
  const [assessments, sheets] = await Promise.all([
    Assessment.find({ institutionId, examId: exam._id }, null, opts).lean() as unknown as Promise<AssessmentDoc[]>,
    MarkSheet.find({ institutionId, examId: exam._id }, null, opts).lean() as unknown as Promise<SheetDoc[]>,
  ]);
  const [subjects, sections] = await Promise.all([
    Subject.find({ institutionId, _id: { $in: assessments.map((a) => a.subjectId) } }, null, opts).lean() as unknown as Promise<Array<{ _id: unknown; name: string; code: string; isCore?: boolean }>>,
    Section.find({ institutionId, _id: { $in: assessments.map((a) => a.sectionId) } }, null, opts).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
  ]);
  const subj = new Map(subjects.map((s) => [String(s._id), s]));
  const secName = new Map(sections.map((s) => [String(s._id), s.name]));
  const papersBySection = new Map<string, AssessmentDoc[]>();
  for (const a of assessments) papersBySection.set(String(a.sectionId), [...(papersBySection.get(String(a.sectionId)) ?? []), a]);
  const sheetOf = new Map(sheets.map((s) => [String(s.assessmentId), s]));

  const studentSection = new Map<string, string>();
  for (const sh of sheets) {
    for (const e of sh.entries) {
      const prev = studentSection.get(String(e.studentId));
      if (prev && prev !== String(sh.sectionId)) return { ok: false, error: "A student has marks in more than one section. Fix the sheets first." };
      studentSection.set(String(e.studentId), String(sh.sectionId));
    }
  }
  // Policy: every active student placed in a section with papers must be on the sheets. Late joiners block publish until the sheets are sent back and completed.
  const paperSections = [...papersBySection.keys()];
  const rostered = (await Student.find({ institutionId, sectionId: { $in: paperSections }, status: "ACTIVE" }, "studentNumber firstName lastName", opts).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>;
  const absent = rostered.filter((st) => !studentSection.has(String(st._id)));
  if (absent.length) return { ok: false, error: `${absent.length} active student(s) are not on the mark sheets, e.g. ${absent.slice(0, 3).map((st) => `${fullName(st)} (${st.studentNumber})`).join(", ")}. Send a sheet back so their marks (or Absent/Exempt) can be added, or withdraw them.` };
  const students = studentSection.size ? ((await Student.find({ institutionId, _id: { $in: [...studentSection.keys()] } }, null, opts).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>) : [];
  const overrides = new Map(exam.passOverrides.map((o) => [String(o.studentId), o.reason]));
  const results: Row[] = [];
  const missing: string[] = [];
  for (const st of students.sort((a, b) => a.studentNumber.localeCompare(b.studentNumber))) {
    const sectionId = studentSection.get(String(st._id)) as string;
    const rows = [];
    let incomplete = false;
    for (const paper of (papersBySection.get(sectionId) ?? []).slice().sort((x, y) => (subj.get(String(x.subjectId))?.name ?? "").localeCompare(subj.get(String(y.subjectId))?.name ?? ""))) {
      const entry = sheetOf.get(String(paper._id))?.entries.find((e) => String(e.studentId) === String(st._id));
      if (!entry) { missing.push(`${fullName(st)} (${st.studentNumber})`); incomplete = true; break; }
      const sb = subj.get(String(paper.subjectId));
      rows.push({ subjectId: String(paper.subjectId), code: sb?.code ?? "", name: sb?.name ?? "—", maxMarks: paper.maxMarks, isCore: Boolean(sb?.isCore), status: entry.status, marks: entry.marks });
    }
    if (incomplete) continue;
    let res;
    try {
      res = computeResult(rows, scheme, { passRule: exam.passRule, ...(overrides.has(String(st._id)) ? { override: { reason: overrides.get(String(st._id)) } } : {}) });
    } catch (e) {
      return { ok: false, error: `${fullName(st)} (${st.studentNumber}): ${(e as Error).message}` };
    }
    results.push({ studentId: String(st._id), studentNumber: st.studentNumber, name: fullName(st), sectionId, section: secName.get(sectionId) ?? "—", ...res } as Row);
  }
  if (missing.length) return { ok: false, error: `${missing.length} student(s) have no marks in every subject, e.g. ${missing.slice(0, 3).join(", ")}. Send the sheet back and complete it.` };
  if (!results.length) return { ok: false, error: "No marks to publish" };
  return { ok: true, results };
}

/** APPROVED -> PUBLISHED. One transaction: exam status, snapshot v1 and audit commit together. Only one publish can win. */
export async function publishExam(examId: string, actor: Actor): Promise<Fail | { ok: true; version: number; students: number }> {
  if (!idOk(examId)) return { ok: false, error: "Exam not found" };
  const { institutionId } = actor;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam) return { ok: false, error: "Exam not found" };
  if (exam.status !== "APPROVED") return { ok: false, error: exam.status === "PUBLISHED" ? "Already published" : "Every sheet must be approved before publishing" };
  const scheme = await loadScheme(institutionId);
  if (!scheme) return { ok: false, error: "Grading scheme is not set up" };

  let claimed = false;
  let snapshotId: unknown;
  try {
    const students = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const built = await buildResults(institutionId, exam, scheme, txn);
      if (!built.ok) throw Object.assign(new Stale(), { userMessage: built.error });
      const res = await Exam.updateOne({ _id: examId, institutionId, status: "APPROVED" }, { $set: { status: "PUBLISHED", resultVersion: 1, publishedAt: new Date(), publishedByMembershipId: actor.membershipId } }, opts);
      if (!res.modifiedCount) throw new Stale();
      claimed = true;
      const [snap] = await ResultSnapshot.create([{ institutionId, examId, version: 1, examName: exam.name, term: exam.term ?? "", passRule: exam.passRule, scheme, results: built.results, publishedByMembershipId: actor.membershipId }], opts);
      snapshotId = snap._id;
      await audit(actor, "EXAM_PUBLISHED", "Exam", examId, { version: 1, students: built.results.length, passed: built.results.filter((r) => r.passed).length, passRule: exam.passRule, overrides: exam.passOverrides.length, scheme: scheme.key }, txn);
      return built.results.length;
    });
    return { ok: true, version: 1, students };
  } catch (e) {
    if (claimed) { // standalone Mongo: undo
      if (snapshotId) await ResultSnapshot.deleteOne({ _id: snapshotId, institutionId });
      await Exam.updateOne({ _id: examId, institutionId, status: "PUBLISHED", resultVersion: 1 }, { $set: { status: "APPROVED", resultVersion: 0 }, $unset: { publishedAt: 1, publishedByMembershipId: 1 } });
    }
    if (e instanceof Stale) return { ok: false, error: (e as { userMessage?: string }).userMessage ?? "Already published or changed. Reload and check." };
    if (isDup(e)) return { ok: false, error: "Already published" };
    throw e;
  }
}

// ---------- reads ----------

/** null = any section; otherwise only sections the actor has an active teaching assignment for. */
async function visibleSectionIds(actor: Actor): Promise<Set<string> | null> {
  if (can(actor.role, "exams:any-section")) return null;
  const ids = (await TeachingAssignment.find({ institutionId: actor.institutionId, membershipId: actor.membershipId, status: "ACTIVE" }, "sectionId").lean()) as unknown as Array<{ sectionId: unknown }>;
  return new Set(ids.map((a) => String(a.sectionId)));
}

export async function getResults(actor: Actor, examId: string) {
  if (!idOk(examId)) return null;
  const { institutionId } = actor;
  const exam = (await Exam.findOne({ _id: examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (!exam || exam.status !== "PUBLISHED") return null;
  const snap = (await ResultSnapshot.findOne({ institutionId, examId, version: exam.resultVersion }).lean()) as unknown as { version: number; publishedAt: Date; scheme: Scheme; results: Row[]; examName: string; term: string; passRule: string } | null;
  if (!snap) return null;
  const level = (await GradeLevel.findOne({ _id: exam.gradeLevelId, institutionId }).lean()) as unknown as { name: string } | null;
  const visible = await visibleSectionIds(actor);
  const results = visible ? snap.results.filter((r) => visible.has(String(r.sectionId))) : snap.results;
  return { exam: { id: String(exam._id), name: snap.examName, term: snap.term, className: level?.name ?? "", passRule: snap.passRule }, version: snap.version, publishedAt: snap.publishedAt.toISOString(), scheme: snap.scheme, results };
}

export async function getReportCard(actor: Actor, examId: string, studentId: string) {
  const data = await getResults(actor, examId);
  const result = data?.results.find((r) => r.studentId === studentId);
  if (!data || !result) return null;
  const school = (await Institution.findOne({ _id: actor.institutionId }).select("name defaultLocale").lean()) as unknown as { name: string; defaultLocale?: string } | null;
  return { school: school?.name ?? "School", locale: school?.defaultLocale ?? "en", ...data, result };
}

// ---------- corrections after publish ----------

type Val = { status: string; marks?: number | null };
const same = (a: Val, b: Val) => a.status === b.status && (a.marks ?? null) === (b.marks ?? null);

export async function requestCorrection(input: unknown, actor: Actor): Promise<Fail | { ok: true; id: string }> {
  const parsed = correctionRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { institutionId } = actor;
  const { assessmentId, studentId, status, marks, reason } = parsed.data;
  const assessment = (await Assessment.findOne({ _id: assessmentId, institutionId }).lean()) as unknown as AssessmentDoc | null;
  if (!assessment || !(await canEnterAssessment(actor, assessment))) return { ok: false, error: "You are not assigned to this subject and section" };
  const exam = (await Exam.findOne({ _id: assessment.examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (exam?.status !== "PUBLISHED") return { ok: false, error: "Only published results need a correction request" };
  const sheet = (await MarkSheet.findOne({ institutionId, assessmentId }).lean()) as unknown as SheetDoc | null;
  const current = sheet?.entries.find((e) => String(e.studentId) === studentId);
  if (!current) return { ok: false, error: "That student has no mark on this paper" };
  if (status === "PRESENT") {
    const err = markError(marks as number, assessment.maxMarks);
    if (err) return { ok: false, error: err };
  }
  const before = { status: current.status, ...(current.marks != null ? { marks: current.marks } : {}) };
  const after = { status, ...(status === "PRESENT" ? { marks } : {}) };
  if (same(before, after)) return { ok: false, error: "That is the same as the published mark" };
  try {
    const id = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const [row] = await MarkCorrection.create([{ institutionId, examId: exam._id, assessmentId, studentId, before, after, reason, requestedByMembershipId: actor.membershipId }], txn ? { session: txn } : {});
      await audit(actor, "CORRECTION_REQUESTED", "MarkCorrection", row._id, { examId: String(exam._id), assessmentId, studentId, before, after, reason }, txn);
      return String(row._id);
    });
    return { ok: true, id };
  } catch (e) {
    if (isDup(e)) return { ok: false, error: "A correction for this student and paper is already waiting for approval" };
    throw e;
  }
}

export async function decideCorrection(input: { correctionId: string; approve: boolean; note?: string }, actor: Actor): Promise<Fail | { ok: true; version?: number }> {
  const { institutionId } = actor;
  if (!idOk(input.correctionId)) return { ok: false, error: "Correction not found" };
  const noteCheck = reasonSchema.safeParse(input.note ?? "");
  if (!input.approve && !noteCheck.success) return { ok: false, error: "Give a reason of at least 10 characters for rejecting" };
  const note = noteCheck.success ? noteCheck.data : undefined;
  const corr = (await MarkCorrection.findOne({ _id: input.correctionId, institutionId }).lean()) as unknown as { _id: unknown; examId: unknown; assessmentId: unknown; studentId: unknown; before: Val; after: Val; reason: string; status: string } | null;
  if (!corr || corr.status !== "PENDING") return { ok: false, error: "Correction not found or already decided" };
  const decided = { decidedByMembershipId: actor.membershipId, decidedAt: new Date(), ...(note ? { decisionNote: note } : {}) };

  if (!input.approve) {
    const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const res = await MarkCorrection.updateOne({ _id: corr._id, institutionId, status: "PENDING" }, { $set: { status: "REJECTED", ...decided } }, txn ? { session: txn } : {});
      if (!res.modifiedCount) return false;
      await audit(actor, "CORRECTION_REJECTED", "MarkCorrection", corr._id, { examId: String(corr.examId), before: corr.before, after: corr.after, reason: corr.reason, note }, txn);
      return true;
    });
    return done ? { ok: true } : { ok: false, error: "Correction not found or already decided" };
  }

  const exam = (await Exam.findOne({ _id: corr.examId, institutionId }).lean()) as unknown as ExamDoc | null;
  if (exam?.status !== "PUBLISHED") return { ok: false, error: "Exam is not published" };
  const prev = (await ResultSnapshot.findOne({ institutionId, examId: exam._id, version: exam.resultVersion }).lean()) as unknown as { scheme: Scheme; results: Row[] } | null;
  if (!prev) return { ok: false, error: "Published result not found" };
  const scheme = validateGradingScheme(prev.scheme); // frozen scheme: later scheme edits never change published results
  const version = exam.resultVersion + 1;
  const marksFilter = corr.before.marks ?? null;
  let sheetChanged = false, versionBumped = false, claimed = false;
  let snapshotId: unknown;
  const setEntry = (v: Val) => ({ $set: { "entries.$.status": v.status, ...(v.marks != null ? { "entries.$.marks": v.marks } : {}) }, ...(v.marks == null ? { $unset: { "entries.$.marks": 1 } } : {}) });
  try {
    await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const c = await MarkCorrection.updateOne({ _id: corr._id, institutionId, status: "PENDING" }, { $set: { status: "APPROVED", resultVersion: version, ...decided } }, opts);
      if (!c.modifiedCount) throw new Stale();
      claimed = true;
      const sh = await MarkSheet.updateOne({ institutionId, assessmentId: corr.assessmentId, entries: { $elemMatch: { studentId: corr.studentId, status: corr.before.status, marks: marksFilter } } }, setEntry(corr.after), opts);
      if (!sh.modifiedCount) throw new Stale();
      sheetChanged = true;
      const ex = await Exam.updateOne({ _id: exam._id, institutionId, status: "PUBLISHED", resultVersion: exam.resultVersion }, { $inc: { resultVersion: 1 } }, opts);
      if (!ex.modifiedCount) throw new Stale();
      versionBumped = true;
      const built = await buildResults(institutionId, exam, scheme, txn);
      if (!built.ok) throw Object.assign(new Stale(), { userMessage: built.error });
      const [snap] = await ResultSnapshot.create([{ institutionId, examId: exam._id, version, examName: exam.name, term: exam.term ?? "", passRule: exam.passRule, scheme, results: built.results, correctionId: corr._id, publishedByMembershipId: actor.membershipId }], opts);
      snapshotId = snap._id;
      const pick = (rows: Row[]) => { const r = rows.find((x) => x.studentId === String(corr.studentId)); return r ? { passed: r.passed, grade: r.grade, percent: r.percent, totalMarks: r.totalMarks } : null; };
      await audit(actor, "CORRECTION_APPROVED", "MarkCorrection", corr._id, {
        examId: String(exam._id), assessmentId: String(corr.assessmentId), studentId: String(corr.studentId), before: corr.before, after: corr.after, reason: corr.reason, note,
        fromVersion: exam.resultVersion, toVersion: version, resultBefore: pick(prev.results), resultAfter: pick(built.results),
      }, txn);
    });
  } catch (e) {
    const id = corr._id;
    // Standalone Mongo has no rollback: undo what we wrote, newest first. Every undo is guarded by the exact
    // value we wrote, so after an aborted transaction (nothing was kept) these match nothing and do no harm.
    if (snapshotId) await ResultSnapshot.deleteOne({ _id: snapshotId, institutionId });
    if (versionBumped) await Exam.updateOne({ _id: exam._id, institutionId, resultVersion: version }, { $inc: { resultVersion: -1 } });
    if (sheetChanged) await MarkSheet.updateOne({ institutionId, assessmentId: corr.assessmentId, entries: { $elemMatch: { studentId: corr.studentId, status: corr.after.status, marks: corr.after.marks ?? null } } }, setEntry(corr.before));
    if (claimed) await MarkCorrection.updateOne({ _id: id, institutionId, status: "APPROVED", resultVersion: version }, { $set: { status: "PENDING" }, $unset: { resultVersion: 1, decidedByMembershipId: 1, decidedAt: 1, decisionNote: 1 } });
    if (e instanceof Stale) return { ok: false, error: (e as { userMessage?: string }).userMessage ?? "The result changed while saving. Reload and try again." };
    if (isDup(e)) return { ok: false, error: "The result changed while saving. Reload and try again." };
    throw e;
  }
  return { ok: true, version };
}

export async function listCorrections(actor: Actor, examId?: string) {
  const { institutionId } = actor;
  const rows = (await MarkCorrection.find({ institutionId, status: "PENDING", ...(examId && idOk(examId) ? { examId } : {}) }).sort({ createdAt: 1 }).limit(100).lean()) as unknown as Array<{ _id: unknown; examId: unknown; assessmentId: unknown; studentId: unknown; before: Val; after: Val; reason: string; createdAt: Date }>;
  if (!rows.length) return [];
  const [exams, papers, students] = await Promise.all([
    Exam.find({ institutionId, _id: { $in: rows.map((r) => r.examId) } }).lean() as unknown as Promise<ExamDoc[]>,
    Assessment.find({ institutionId, _id: { $in: rows.map((r) => r.assessmentId) } }).lean() as unknown as Promise<AssessmentDoc[]>,
    Student.find({ institutionId, _id: { $in: rows.map((r) => r.studentId) } }).lean() as unknown as Promise<Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>>,
  ]);
  const subjects = (await Subject.find({ institutionId, _id: { $in: papers.map((p) => p.subjectId) } }).lean()) as unknown as Array<{ _id: unknown; name: string }>;
  const ex = new Map(exams.map((x) => [String(x._id), x.name]));
  const pa = new Map(papers.map((x) => [String(x._id), { subject: subjects.find((s) => String(s._id) === String(x.subjectId))?.name ?? "—", max: x.maxMarks }]));
  const st = new Map(students.map((x) => [String(x._id), `${fullName(x)} (${x.studentNumber})`]));
  return rows.map((r) => ({ id: String(r._id), exam: ex.get(String(r.examId)) ?? "—", subject: pa.get(String(r.assessmentId))?.subject ?? "—", maxMarks: pa.get(String(r.assessmentId))?.max ?? 0, student: st.get(String(r.studentId)) ?? "—", before: r.before, after: r.after, reason: r.reason, requestedAt: r.createdAt.toISOString() }));
}
