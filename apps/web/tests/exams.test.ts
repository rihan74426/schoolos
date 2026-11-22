import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildInitialPolicy } from "@schoolos/core";
import {
  AcademicYear, Assessment, AuditEvent, ClassSubject, Exam, GradeLevel, GradingScheme, InstitutionPolicy, MarkCorrection, MarkSheet, Membership, ResultSnapshot, Section, Student, Subject, TeachingAssignment,
} from "@schoolos/db";
import { assignTeacher } from "@/server/structure";
import { createSubject, mapSubjectToClass, setSubjectCore, unmapSubjectFromClass } from "@/server/subjects";
import {
  approvalQueue, approveSheet, createExam, getExamDetail, getMarkSheet, listExams, mySheets, openExam, returnSheet, saveMarks, setPassOverride, submitSheet, updateAssessment, updateExamRules,
} from "@/server/exams";
import { decideCorrection, getReportCard, getResults, listCorrections, publishExam, requestCorrection } from "@/server/results";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const A = oid();
const B = oid();
const as = (role: string, institutionId = A, membershipId: unknown = oid()) => ({ membershipId, institutionId, role });
const principal = as("PRINCIPAL");
const coordinator = as("ACADEMIC_COORDINATOR");

const ids: Record<string, string> = {};
const teacher = { math: as("TEACHER", A, oid()), sci: as("TEACHER", A, oid()), nobody: as("TEACHER", A, oid()) };
let examId = "";
const paper = async (subject: string, section = "A") => {
  const a = (await Assessment.findOne({ institutionId: A, examId, subjectId: ids[subject], sectionId: ids[`sec${section}`] }).lean()) as unknown as { _id: unknown };
  return String(a._id);
};
const P = (studentId: string, marks: number) => ({ studentId, status: "PRESENT", marks });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Subject, ClassSubject, Exam, Assessment, MarkSheet, ResultSnapshot, MarkCorrection, TeachingAssignment, Membership, Student, Section, AcademicYear, GradeLevel, GradingScheme, InstitutionPolicy, AuditEvent].map((m) => m.syncIndexes()));
  for (const id of [A, B]) await InstitutionPolicy.create({ institutionId: id, policy: buildInitialPolicy("bd-school"), version: 1 }); // gpa-5, pass 33%
  const year = await AcademicYear.create({ institutionId: A, name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  const yearB = await AcademicYear.create({ institutionId: B, name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  const level = await GradeLevel.create({ institutionId: A, name: "Class 6" });
  const levelB = await GradeLevel.create({ institutionId: B, name: "Class 6" });
  const secA = await Section.create({ institutionId: A, academicYearId: year._id, gradeLevelId: level._id, name: "A" });
  const secB = await Section.create({ institutionId: A, academicYearId: year._id, gradeLevelId: level._id, name: "B" });
  const stu = await Student.create([
    { institutionId: A, studentNumber: "S1", firstName: "One", sectionId: secA._id },
    { institutionId: A, studentNumber: "S2", firstName: "Two", sectionId: secA._id },
    { institutionId: A, studentNumber: "S3", firstName: "Three", sectionId: secA._id },
    { institutionId: A, studentNumber: "S4", firstName: "Four", sectionId: secB._id },
  ]);
  Object.assign(ids, { year: String(year._id), yearB: String(yearB._id), level: String(level._id), levelB: String(levelB._id), secA: String(secA._id), secB: String(secB._id), s1: String(stu[0]._id), s2: String(stu[1]._id), s3: String(stu[2]._id), s4: String(stu[3]._id) });
  for (const [key, who] of Object.entries(teacher)) {
    const m = await Membership.create({ institutionId: A, clerkUserId: `user_${key}`, role: "TEACHER" });
    (who as { membershipId: unknown }).membershipId = m._id;
  }
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("subjects and teaching assignments", () => {
  it("creates subjects, rejects duplicate codes, toggles core with an audit trail", async () => {
    for (const [key, code, name, isCore] of [["math", "MATH", "Mathematics", true], ["sci", "SCI", "Science", false], ["art", "ART", "Art", false]] as const) {
      const res = await createSubject({ code, name, isCore }, principal);
      expect(res.ok).toBe(true);
      ids[key] = (res as { id: string }).id;
    }
    expect(await createSubject({ code: "math", name: "Maths again" }, principal)).toMatchObject({ ok: false, error: "A subject with this code already exists" });
    expect(await createSubject({ code: "B", name: "Other school" }, as("PRINCIPAL", B))).toMatchObject({ ok: true }); // same code space is per school
    expect(await setSubjectCore(ids.art, true, principal)).toEqual({ ok: true });
    expect(await setSubjectCore(ids.art, false, principal)).toEqual({ ok: true });
    expect(await setSubjectCore(ids.art, true, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    expect(await AuditEvent.countDocuments({ institutionId: A, action: "SUBJECT_UPDATED" })).toBe(2);
    expect(await Subject.findOne({ institutionId: A, code: "MATH" }).lean()).toMatchObject({ isCore: true });
  });
  it("maps subjects to a class only within the same school", async () => {
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.math, defaultMaxMarks: 100 }, principal)).toEqual({ ok: true });
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.math, defaultMaxMarks: 100 }, principal)).toEqual({ ok: true }); // idempotent
    expect(await mapSubjectToClass({ gradeLevelId: ids.levelB, subjectId: ids.math, defaultMaxMarks: 100 }, principal)).toMatchObject({ ok: false, error: "Class not found" });
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.math, defaultMaxMarks: 100 }, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.sci, defaultMaxMarks: 100 }, principal)).toEqual({ ok: true });
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.art, defaultMaxMarks: 100 }, principal)).toEqual({ ok: true });
    expect(await ClassSubject.countDocuments({ institutionId: A, gradeLevelId: ids.level })).toBe(3);
    expect(await unmapSubjectFromClass(ids.level, ids.art, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    expect(await unmapSubjectFromClass(ids.level, ids.art, principal)).toEqual({ ok: true });
    expect(await mapSubjectToClass({ gradeLevelId: ids.level, subjectId: ids.art, defaultMaxMarks: 50 }, principal)).toEqual({ ok: true });
  });
  it("lets a teacher teach several subjects in one section but not the same one twice", async () => {
    const m = String(teacher.math.membershipId);
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA, subjectId: ids.math }, principal)).toMatchObject({ ok: true });
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA, subjectId: ids.sci }, principal)).toMatchObject({ ok: true });
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA, subjectId: ids.sci }, principal)).toMatchObject({ ok: false });
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA }, principal)).toMatchObject({ ok: true }); // class teacher row
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA }, principal)).toMatchObject({ ok: false });
    expect(await assignTeacher({ membershipId: m, sectionId: ids.secA, subjectId: String(oid()) }, principal)).toMatchObject({ ok: false, error: "Subject not found" });
    // finish the fixture: math teacher -> MATH only, science teacher -> SCI only
    await TeachingAssignment.deleteMany({ institutionId: A });
    const year = ids.year;
    await TeachingAssignment.create([
      { institutionId: A, membershipId: teacher.math.membershipId, sectionId: ids.secA, subjectId: ids.math, academicYearId: year },
      { institutionId: A, membershipId: teacher.sci.membershipId, sectionId: ids.secA, subjectId: ids.sci, academicYearId: year },
    ]);
  });
});

describe("exam setup", () => {
  it("creates one paper per section and mapped subject, with the class default full marks", async () => {
    expect(await createExam({ name: "Half-yearly", academicYearId: ids.yearB, gradeLevelId: ids.level }, principal)).toMatchObject({ ok: false, error: "Academic year not found" });
    expect(await createExam({ name: "Half-yearly", academicYearId: ids.year, gradeLevelId: ids.level }, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    const res = await createExam({ name: "Half-yearly", term: "Term 2", academicYearId: ids.year, gradeLevelId: ids.level }, principal);
    expect(res).toMatchObject({ ok: true, assessments: 6 });
    examId = (res as { id: string }).id;
    expect(await createExam({ name: "Half-yearly", academicYearId: ids.year, gradeLevelId: ids.level }, principal)).toMatchObject({ ok: false, error: "An exam with this name already exists for that class and year" });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "DRAFT", passRule: "ALL_SUBJECTS" });
    expect((await Assessment.findOne({ institutionId: A, examId, subjectId: ids.art, sectionId: ids.secA }).lean()) as unknown).toMatchObject({ maxMarks: 50 });
  });
  it("needs sections and mapped subjects", async () => {
    const empty = await GradeLevel.create({ institutionId: A, name: "Class 9" });
    expect(await createExam({ name: "X", academicYearId: ids.year, gradeLevelId: String(empty._id) }, principal)).toMatchObject({ ok: false, error: "This class has no sections in that year yet" });
    const sec = await Section.create({ institutionId: A, academicYearId: ids.year, gradeLevelId: empty._id, name: "A" });
    expect(await createExam({ name: "X", academicYearId: ids.year, gradeLevelId: String(empty._id) }, principal)).toMatchObject({ ok: false, error: "Map subjects to this class in Settings first" });
    await Section.deleteOne({ _id: sec._id, institutionId: A });
  });
  it("lets full marks change only while a draft, and marks cannot be entered before opening", async () => {
    const sciA = await paper("sci");
    expect(await updateAssessment({ assessmentId: sciA, maxMarks: 100, date: "2026-11-30" }, principal)).toEqual({ ok: true });
    expect(await updateAssessment({ assessmentId: sciA, maxMarks: 0 }, principal)).toMatchObject({ ok: false });
    expect(await updateAssessment({ assessmentId: sciA, maxMarks: 80 }, as("PRINCIPAL", B))).toMatchObject({ ok: false, error: "Paper not found" });
    expect(await saveMarks({ assessmentId: sciA, entries: [P(ids.s1, 5)] }, teacher.sci)).toMatchObject({ ok: false });
    expect(await updateExamRules(examId, "WHATEVER", principal)).toMatchObject({ ok: false });
  });
  it("opens once, creating one sheet per paper", async () => {
    expect(await openExam(examId, principal)).toEqual({ ok: true });
    expect(await MarkSheet.countDocuments({ institutionId: A, examId })).toBe(6);
    expect(await openExam(examId, principal)).toMatchObject({ ok: false });
    expect(await openExam(examId, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    expect(await updateAssessment({ assessmentId: await paper("sci"), maxMarks: 60 }, principal)).toMatchObject({ ok: false });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "ENTRY" });
  });
});

describe("marks entry", () => {
  it("blocks teachers who are not assigned to that subject and section", async () => {
    const mathA = await paper("math");
    const sciA = await paper("sci");
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 50)] }, teacher.nobody)).toMatchObject({ ok: false, error: "You are not assigned to this subject and section" });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 50)] }, teacher.sci)).toMatchObject({ ok: false }); // assigned to SCI, not MATH
    expect(await saveMarks({ assessmentId: await paper("math", "B"), entries: [P(ids.s4, 50)] }, teacher.math)).toMatchObject({ ok: false }); // right subject, wrong section
    expect(await getMarkSheet(teacher.nobody, mathA)).toBeNull();
    expect(await getMarkSheet(teacher.sci, mathA)).toBeNull();
    expect(await getMarkSheet(teacher.math, sciA)).toBeNull();
    expect(await getMarkSheet(as("TEACHER", B), mathA)).toBeNull();
    expect(await submitSheet(mathA, teacher.nobody)).toMatchObject({ ok: false });
    expect((await mySheets(teacher.math)).map((r) => r.subject)).toEqual(["Mathematics"]);
    expect((await mySheets(teacher.nobody))).toEqual([]);
    expect((await mySheets(coordinator)).length).toBe(6);
  });
  it("rejects marks above full marks, negatives, odd decimals, strangers and duplicates", async () => {
    const mathA = await paper("math");
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 101)] }, teacher.math)).toMatchObject({ ok: false, error: "Marks cannot be more than 100" });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, -1)] }, teacher.math)).toMatchObject({ ok: false, error: "Marks cannot be negative" });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 50.555)] }, teacher.math)).toMatchObject({ ok: false });
    expect(await saveMarks({ assessmentId: mathA, entries: [{ studentId: ids.s1, status: "PRESENT" }] }, teacher.math)).toMatchObject({ ok: false });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s4, 50)] }, teacher.math)).toMatchObject({ ok: false, error: "A student in the list is not in this section" });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 50), P(ids.s1, 60)] }, teacher.math)).toMatchObject({ ok: false, error: "A student appears twice" });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(String(oid()), 50)] }, teacher.math)).toMatchObject({ ok: false });
    expect(((await MarkSheet.findOne({ institutionId: A, assessmentId: mathA }).lean()) as unknown as { entries: unknown[] }).entries).toHaveLength(0);
  });
  it("saves partially but only submits a complete sheet", async () => {
    const mathA = await paper("math");
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 90)] }, teacher.math)).toEqual({ ok: true, saved: 1 });
    expect(await submitSheet(mathA, teacher.math)).toMatchObject({ ok: false, error: expect.stringContaining("2 student(s) still have no marks") });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 90), P(ids.s2, 20), { studentId: ids.s3, status: "ABSENT" }] }, teacher.math)).toEqual({ ok: true, saved: 3 });
    const sheet = await getMarkSheet(teacher.math, mathA);
    expect(sheet?.students.map((s) => [s.number, s.status, s.marks])).toEqual([["S1", "PRESENT", 90], ["S2", "PRESENT", 20], ["S3", "ABSENT", null]]);
    expect(sheet).toMatchObject({ canEdit: true, paper: { subject: "Mathematics", maxMarks: 100 } });
  });
  it("moves the exam to SUBMITTED only when every sheet is in, and approval needs a submitted sheet", async () => {
    const mathA = await paper("math");
    const sciA = await paper("sci");
    const artA = await paper("art");
    expect(await approveSheet(mathA, coordinator)).toMatchObject({ ok: false, error: "Only submitted sheets can be approved" });
    expect(await submitSheet(mathA, teacher.math)).toEqual({ ok: true });
    expect(await submitSheet(mathA, teacher.math)).toMatchObject({ ok: false });
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s1, 99)] }, teacher.math)).toMatchObject({ ok: false }); // locked once submitted
    expect(await saveMarks({ assessmentId: sciA, entries: [P(ids.s1, 80), P(ids.s2, 70), P(ids.s3, 60)] }, teacher.sci)).toMatchObject({ ok: true });
    expect(await submitSheet(sciA, teacher.sci)).toEqual({ ok: true });
    expect(await saveMarks({ assessmentId: artA, entries: [P(ids.s1, 40), P(ids.s2, 45), { studentId: ids.s3, status: "EXEMPT" }] }, coordinator)).toMatchObject({ ok: true }); // coordinators may enter any section
    expect(await submitSheet(artA, coordinator)).toEqual({ ok: true });
    for (const subject of ["math", "sci", "art"]) {
      expect(await saveMarks({ assessmentId: await paper(subject, "B"), entries: [P(ids.s4, subject === "art" ? 30 : 75)] }, coordinator)).toMatchObject({ ok: true });
    }
    for (const subject of ["math", "sci"]) expect(await submitSheet(await paper(subject, "B"), coordinator)).toEqual({ ok: true });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "ENTRY" });
    expect(await submitSheet(await paper("art", "B"), coordinator)).toEqual({ ok: true });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "SUBMITTED" });
    expect((await approvalQueue(A)).length).toBe(6);
    expect(await approvalQueue(B)).toEqual([]);
  });
  it("sends a sheet back with a reason, reopening the exam; the teacher fixes and resubmits", async () => {
    const sciA = await paper("sci");
    expect(await returnSheet({ assessmentId: sciA, reason: "short" }, coordinator)).toMatchObject({ ok: false });
    expect(await returnSheet({ assessmentId: sciA, reason: "Check S3 marks again" }, as("ACADEMIC_COORDINATOR", B))).toMatchObject({ ok: false, error: "Sheet not found" });
    expect(await returnSheet({ assessmentId: sciA, reason: "Check S3 marks again" }, coordinator)).toEqual({ ok: true });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "ENTRY" });
    expect(await getMarkSheet(teacher.sci, sciA)).toMatchObject({ canEdit: true, sheet: { status: "ENTRY", returnReason: "Check S3 marks again" } });
    expect(await saveMarks({ assessmentId: sciA, entries: [P(ids.s1, 80), P(ids.s2, 70), P(ids.s3, 60)] }, teacher.sci)).toMatchObject({ ok: true });
    expect(await submitSheet(sciA, teacher.sci)).toEqual({ ok: true });
    expect(await AuditEvent.countDocuments({ institutionId: A, action: "SHEET_RETURNED" })).toBe(1);
  });
  it("approves every sheet, then the exam is APPROVED and entry is locked", async () => {
    const sheets = (await MarkSheet.find({ institutionId: A, examId }).lean()) as unknown as Array<{ assessmentId: unknown }>;
    for (const [i, s] of sheets.entries()) {
      expect(await approveSheet(String(s.assessmentId), coordinator)).toEqual({ ok: true });
      expect((await Exam.findOne({ _id: examId, institutionId: A }).lean()) as unknown).toMatchObject({ status: i === sheets.length - 1 ? "APPROVED" : "SUBMITTED" });
    }
    expect(await saveMarks({ assessmentId: await paper("math"), entries: [P(ids.s1, 1)] }, teacher.math)).toMatchObject({ ok: false });
    expect(await approveSheet(await paper("math"), coordinator)).toMatchObject({ ok: false });
  });
});

describe("publish", () => {
  it("is refused unless every sheet is approved, and cannot be done by another school", async () => {
    expect(await publishExam(examId, as("PRINCIPAL", B))).toMatchObject({ ok: false, error: "Exam not found" });
    const draft = (await createExam({ name: "Unit test", academicYearId: ids.year, gradeLevelId: ids.level }, principal)) as { id: string };
    expect(await publishExam(draft.id, principal)).toMatchObject({ ok: false, error: "Every sheet must be approved before publishing" });
  });
  it("applies the exam controller's pass rule and per-student decisions", async () => {
    expect(await setPassOverride({ examId, studentId: ids.s2, reason: "short" }, principal)).toMatchObject({ ok: false });
    expect(await setPassOverride({ examId, studentId: String(oid()), reason: "Illness during the exam week" }, principal)).toMatchObject({ ok: false, error: "That student has no marks in this exam" });
    expect(await setPassOverride({ examId, studentId: ids.s2, reason: "Illness during the exam week" }, as("PRINCIPAL", B))).toMatchObject({ ok: false, error: "Exam not found" });
    expect(await setPassOverride({ examId, studentId: ids.s2, reason: "Illness during the exam week" }, principal)).toEqual({ ok: true });
    expect(await setPassOverride({ examId, studentId: ids.s2, reason: "Removing the earlier decision", remove: true }, principal)).toEqual({ ok: true });
    expect(await setPassOverride({ examId, studentId: ids.s2, reason: "Illness during the exam week" }, principal)).toEqual({ ok: true });
    expect(await updateExamRules(examId, "CORE_ONLY", principal)).toEqual({ ok: true });
    expect(await updateExamRules(examId, "ALL_SUBJECTS", principal)).toEqual({ ok: true });
    expect(await AuditEvent.countDocuments({ institutionId: A, action: "EXAM_RULE_CHANGED" })).toBe(2);
    expect((await getExamDetail(principal, examId))?.overrides).toMatchObject([{ reason: "Illness during the exam week" }]);
  });
  it("lets only one of two simultaneous publishes win and writes snapshot v1 with the frozen scheme", async () => {
    const res = await Promise.all([publishExam(examId, principal), publishExam(examId, principal)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.find((r) => r.ok)).toMatchObject({ version: 1, students: 4 });
    expect(await ResultSnapshot.countDocuments({ institutionId: A, examId })).toBe(1);
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ status: "PUBLISHED", resultVersion: 1 });
    expect(await AuditEvent.countDocuments({ institutionId: A, action: "EXAM_PUBLISHED", entityId: examId })).toBe(1);
    const r = await getResults(principal, examId);
    expect(r?.version).toBe(1);
    expect(r?.scheme).toMatchObject({ key: "gpa-5", passPercent: 33 });
    const byNum = Object.fromEntries((r?.results ?? []).map((x) => [x.studentNumber, x]));
    expect(byNum.S1).toMatchObject({ passed: true, totalMarks: 210, totalMax: 250, grade: "A+" }); // 90 + 80 + 40
    expect(byNum.S2).toMatchObject({ passed: true, overridden: true, failedSubjects: ["Mathematics"] }); // failed Math, passed by decision
    expect(byNum.S3).toMatchObject({ passed: false, failedSubjects: ["Mathematics"], totalMax: 200 }); // absent in Math; Art exempt
    expect(byNum.S4).toMatchObject({ passed: true, section: "B" });
  });
  it("hides results from other schools and builds a report card from the snapshot", async () => {
    expect(await getResults(as("PRINCIPAL", B), examId)).toBeNull();
    expect(await getReportCard(as("PRINCIPAL", B), examId, ids.s1)).toBeNull();
    const card = await getReportCard(principal, examId, ids.s1);
    expect(card).toMatchObject({ school: "School", locale: "en", version: 1, result: { name: "One" } });
    expect(await getReportCard(principal, examId, String(oid()))).toBeNull();
    expect((await listExams(as("PRINCIPAL", B))).exams).toEqual([]);
    expect((await listExams(principal)).exams.find((e) => e.id === examId)).toMatchObject({ status: "PUBLISHED", resultVersion: 1, sheets: { APPROVED: 6 } });
  });
  it("cannot be edited after publishing by any normal route", async () => {
    const mathA = await paper("math");
    expect(await saveMarks({ assessmentId: mathA, entries: [P(ids.s2, 99)] }, teacher.math)).toMatchObject({ ok: false });
    expect(await submitSheet(mathA, teacher.math)).toMatchObject({ ok: false });
    expect(await approveSheet(mathA, coordinator)).toMatchObject({ ok: false });
    expect(await returnSheet({ assessmentId: mathA, reason: "Please redo the whole sheet" }, coordinator)).toMatchObject({ ok: false, error: "Published results change only through an approved correction" });
    expect(await updateAssessment({ assessmentId: mathA, maxMarks: 10 }, principal)).toMatchObject({ ok: false });
    expect(await updateExamRules(examId, "CORE_ONLY", principal)).toMatchObject({ ok: false });
    expect(await setPassOverride({ examId, studentId: ids.s3, reason: "Trying to pass after publish" }, principal)).toMatchObject({ ok: false, error: "Published results cannot be overridden" });
    expect(await publishExam(examId, principal)).toMatchObject({ ok: false, error: "Already published" });
    expect(await openExam(examId, principal)).toMatchObject({ ok: false });
    expect(await ResultSnapshot.countDocuments({ institutionId: A, examId })).toBe(1);
  });
});

describe("corrections after publish", () => {
  let correctionId = "";
  it("needs assignment, a real change and a valid mark", async () => {
    const sciA = await paper("sci");
    const base = { assessmentId: sciA, studentId: ids.s2, status: "PRESENT", marks: 75, reason: "Totalling mistake found on the script" };
    expect(await requestCorrection(base, teacher.nobody)).toMatchObject({ ok: false, error: "You are not assigned to this subject and section" });
    expect(await requestCorrection(base, teacher.math)).toMatchObject({ ok: false }); // MATH teacher, SCI paper
    expect(await requestCorrection(base, as("TEACHER", B))).toMatchObject({ ok: false });
    expect(await requestCorrection({ ...base, marks: 70 }, teacher.sci)).toMatchObject({ ok: false, error: "That is the same as the published mark" });
    expect(await requestCorrection({ ...base, marks: 101 }, teacher.sci)).toMatchObject({ ok: false });
    expect(await requestCorrection({ ...base, reason: "short" }, teacher.sci)).toMatchObject({ ok: false });
    expect(await requestCorrection({ ...base, studentId: ids.s4 }, teacher.sci)).toMatchObject({ ok: false, error: "That student has no mark on this paper" });
    const ok = await requestCorrection(base, teacher.sci);
    expect(ok).toMatchObject({ ok: true });
    correctionId = (ok as { id: string }).id;
    expect(await requestCorrection({ ...base, marks: 76 }, teacher.sci)).toMatchObject({ ok: false, error: "A correction for this student and paper is already waiting for approval" });
    expect(await MarkCorrection.findOne({ institutionId: A, _id: correctionId }).lean()).toMatchObject({ status: "PENDING", before: { status: "PRESENT", marks: 70 }, after: { status: "PRESENT", marks: 75 } });
    expect((await listCorrections(principal)).length).toBe(1);
    expect(await listCorrections(as("PRINCIPAL", B))).toEqual([]);
  });
  it("changes nothing until approved; rejecting needs a reason and writes no new version", async () => {
    expect(((await MarkSheet.findOne({ institutionId: A, assessmentId: await paper("sci") }).lean()) as unknown as { entries: Array<{ marks: number }> }).entries[1].marks).toBe(70);
    expect(await decideCorrection({ correctionId, approve: false }, principal)).toMatchObject({ ok: false });
    expect(await decideCorrection({ correctionId, approve: false, note: "Script was re-checked: 70 stands" }, as("PRINCIPAL", B))).toMatchObject({ ok: false });
    expect(await decideCorrection({ correctionId, approve: false, note: "Script was re-checked: 70 stands" }, principal)).toEqual({ ok: true });
    expect(await MarkCorrection.findOne({ institutionId: A, _id: correctionId }).lean()).toMatchObject({ status: "REJECTED" });
    expect(await decideCorrection({ correctionId, approve: true }, principal)).toMatchObject({ ok: false, error: "Correction not found or already decided" });
    expect(await ResultSnapshot.countDocuments({ institutionId: A, examId })).toBe(1);
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ resultVersion: 1 });
  });
  it("approval updates the sheet, writes snapshot v2 with the OLD scheme, keeps v1 and audits before/after", async () => {
    // The school changes its grading scheme after publishing. Published results must not move.
    await GradingScheme.create({ institutionId: A, key: "gpa-5", name: "Stricter", kind: "GPA", passPercent: 99, failLabel: "F", bands: [{ label: "A+", minPercent: 99, gradePoint: 5 }] });
    const req = (await requestCorrection({ assessmentId: await paper("math"), studentId: ids.s3, status: "PRESENT", marks: 50, reason: "Script found: was marked absent by mistake" }, teacher.math)) as { id: string };
    expect(req).toMatchObject({ ok: true });
    const res = await Promise.all([decideCorrection({ correctionId: req.id, approve: true }, principal), decideCorrection({ correctionId: req.id, approve: true }, principal)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.find((r) => r.ok)).toMatchObject({ version: 2 });
    expect(await Exam.findOne({ _id: examId, institutionId: A }).lean()).toMatchObject({ resultVersion: 2 });
    const v1 = (await ResultSnapshot.findOne({ institutionId: A, examId, version: 1 }).lean()) as unknown as { results: Array<{ studentNumber: string; passed: boolean }> };
    const v2 = (await ResultSnapshot.findOne({ institutionId: A, examId, version: 2 }).lean()) as unknown as { results: Array<{ studentNumber: string; passed: boolean }>; scheme: { passPercent: number } };
    expect(v1.results.find((r) => r.studentNumber === "S3")?.passed).toBe(false); // history untouched
    expect(v2.results.find((r) => r.studentNumber === "S3")?.passed).toBe(true); // 50 in Math, Science 60, Art exempt
    expect(v2.scheme.passPercent).toBe(33); // frozen scheme, not the stricter one
    expect((await getResults(principal, examId))?.version).toBe(2);
    expect(((await MarkSheet.findOne({ institutionId: A, assessmentId: await paper("math") }).lean()) as unknown as { entries: Array<{ studentId: unknown; status: string; marks?: number }> }).entries.find((e) => String(e.studentId) === ids.s3)).toMatchObject({ status: "PRESENT", marks: 50 });
    const audit = (await AuditEvent.findOne({ institutionId: A, action: "CORRECTION_APPROVED", entityId: req.id }).lean()) as unknown as { metadata: Record<string, unknown> };
    expect(audit.metadata).toMatchObject({ before: { status: "ABSENT" }, after: { status: "PRESENT", marks: 50 }, fromVersion: 1, toVersion: 2, resultBefore: { passed: false }, resultAfter: { passed: true } });
    expect(await MarkCorrection.countDocuments({ institutionId: A, examId, status: "APPROVED" })).toBe(1);
    expect(await ResultSnapshot.countDocuments({ institutionId: A, examId })).toBe(2);
  });
});

describe("tenant isolation", () => {
  it("never leaks exams, sheets or snapshots across schools", async () => {
    const b = as("PRINCIPAL", B);
    expect(await getExamDetail(b, examId)).toBeNull();
    expect(await getResults(b, examId)).toBeNull();
    expect(await approvalQueue(B)).toEqual([]);
    expect(await mySheets(as("TEACHER", B))).toEqual([]);
    expect(await decideCorrection({ correctionId: String(oid()), approve: true }, b)).toMatchObject({ ok: false });
    expect(await ResultSnapshot.countDocuments({ institutionId: B })).toBe(0);
    expect(await MarkSheet.countDocuments({ institutionId: B })).toBe(0);
  });
  it("keeps one sheet per paper at the database level", async () => {
    const mathA = await paper("math");
    await expect(MarkSheet.create({ institutionId: A, examId, assessmentId: mathA, sectionId: ids.secA, subjectId: ids.math })).rejects.toMatchObject({ code: 11000 });
  });
});
