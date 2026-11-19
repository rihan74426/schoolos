import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AcademicYear, AuditEvent, Enrollment, GradeLevel, Guardian, Section, Student } from "@schoolos/db";
import { addGuardian, createStudent, enrollStudent, getStudentProfile, importStudents, listCurrentSections, listStudents } from "@/server/students";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const schoolA = oid();
const schoolB = oid();
const actor = (institutionId = schoolA) => ({ membershipId: oid(), institutionId, role: "ADMIN" });
let sectionA: string;
let sectionA2: string;
let oldYearSection: string;
let sectionB: string;

const csv = (rows: string[]) => `studentNumber,firstName,lastName,dateOfBirth,guardianName,guardianPhone,guardianRelationship\n${rows.join("\n")}\n`;

async function seed(institutionId: mongoose.Types.ObjectId, name: string) {
  const year = await AcademicYear.create({ institutionId, name, startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  const level = await GradeLevel.create({ institutionId, name: "Class 6" });
  const a = await Section.create({ institutionId, academicYearId: year._id, gradeLevelId: level._id, name: "A" });
  const b = await Section.create({ institutionId, academicYearId: year._id, gradeLevelId: level._id, name: "B" });
  return { year, level, a, b };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AcademicYear, GradeLevel, Section, Student, Guardian, Enrollment].map((m) => m.syncIndexes()));
  const a = await seed(schoolA, "2026");
  sectionA = String(a.a._id);
  sectionA2 = String(a.b._id);
  const oldYear = await AcademicYear.create({ institutionId: schoolA, name: "2025", startsOn: "2025-01-01", endsOn: "2025-12-31" });
  oldYearSection = String((await Section.create({ institutionId: schoolA, academicYearId: oldYear._id, gradeLevelId: a.level._id, name: "Old" }))._id);
  sectionB = String((await seed(schoolB, "2026")).a._id);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("students, guardians, enrollment", () => {
  it("creates a student with a guardian and enrolls in one step; numbers are unique per school", async () => {
    const res = await createStudent(
      { studentNumber: "A1", firstName: "Abdullah", lastName: "Rahman", dateOfBirth: "2014-03-15", guardian: { fullName: "Karim Rahman", phone: "01712-345678", relationship: "Father" } },
      sectionA,
      actor(),
    );
    expect(res.ok).toBe(true);
    const profile = await getStudentProfile(schoolA, (res as { id: string }).id);
    expect(String(profile?.student.sectionId)).toBe(sectionA);
    expect(profile?.enrollments).toHaveLength(1);
    expect(profile?.guardians[0]).toMatchObject({ fullName: "Karim Rahman", phone: "+8801712345678" });
    expect(profile?.guardians[0].studentLinks[0].isPrimary).toBe(true);
    expect(await createStudent({ studentNumber: "A1", firstName: "X", lastName: "Y" }, undefined, actor())).toMatchObject({ ok: false, error: "That student number already exists" });
    expect((await createStudent({ studentNumber: "A1", firstName: "X", lastName: "Y" }, undefined, actor(schoolB))).ok).toBe(true);
    expect(await getStudentProfile(schoolB, (res as { id: string }).id)).toBeNull();
  });

  it("transfers within a year without duplicating enrollment; rejects bad sections", async () => {
    const created = (await createStudent({ studentNumber: "T1", firstName: "T", lastName: "One" }, sectionA, actor())) as { id: string };
    expect(await enrollStudent({ studentId: created.id, sectionId: sectionA }, actor())).toEqual({ ok: true, changed: false });
    expect(await enrollStudent({ studentId: created.id, sectionId: sectionA2 }, actor())).toEqual({ ok: true, changed: true });
    expect(await Enrollment.countDocuments({ institutionId: schoolA, studentId: created.id })).toBe(1);
    const s = (await Student.findOne({ _id: created.id, institutionId: schoolA }).lean()) as unknown as { sectionId: unknown };
    expect(String(s.sectionId)).toBe(sectionA2);
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "STUDENT_TRANSFERRED" })).toBeGreaterThan(0);
    expect(await enrollStudent({ studentId: created.id, sectionId: oldYearSection }, actor())).toMatchObject({ ok: false, error: "Section is not in the current academic year" });
    expect(await enrollStudent({ studentId: created.id, sectionId: sectionB }, actor())).toMatchObject({ ok: false, error: "Section not found" });
  });

  it("blocks cross-tenant guardian links and reuses a guardian by phone", async () => {
    const one = (await createStudent({ studentNumber: "G1", firstName: "G", lastName: "One" }, undefined, actor())) as { id: string };
    const two = (await createStudent({ studentNumber: "G2", firstName: "G", lastName: "Two" }, undefined, actor())) as { id: string };
    const guardian = { fullName: "Rahima", phone: "01812345678", relationship: "Mother" };
    expect(await addGuardian({ studentId: one.id, guardian }, actor(schoolB))).toMatchObject({ ok: false, error: "Student not found" });
    expect((await addGuardian({ studentId: one.id, guardian }, actor())).ok).toBe(true);
    expect((await addGuardian({ studentId: two.id, guardian }, actor())).ok).toBe(true);
    expect((await addGuardian({ studentId: two.id, guardian }, actor())).ok).toBe(true); // idempotent
    const docs = (await Guardian.find({ institutionId: schoolA, phone: "+8801812345678" }).lean()) as unknown as Array<{ studentLinks: unknown[] }>;
    expect(docs).toHaveLength(1);
    expect(docs[0].studentLinks).toHaveLength(2);
    expect(await Guardian.countDocuments({ institutionId: schoolB, phone: "+8801812345678" })).toBe(0);
  });

  it("lists current-year sections with class names", async () => {
    expect((await listCurrentSections(schoolA)).map((s) => s.label).sort()).toEqual(["Class 6 – A", "Class 6 – B"]);
  });

  it("searches safely and per school", async () => {
    expect((await listStudents(schoolA, { q: "abd" })).rows.map((r) => r.studentNumber)).toEqual(["A1"]);
    expect((await listStudents(schoolA, { q: "(" })).rows).toEqual([]); // regex metacharacters are escaped
    expect((await listStudents(schoolB, { q: "abd" })).rows).toEqual([]);
    expect((await listStudents(schoolA, { sectionId: sectionA })).total).toBeGreaterThan(0);
  });
});

describe("CSV import", () => {
  const thirty = Array.from({ length: 30 }, (_, i) => `S${100 + i},Student${i},Test,2014-01-${String((i % 28) + 1).padStart(2, "0")},Parent${i % 15},0171${String(1000000 + (i % 15))},Father`);
  const bad = ["S200,,Missing,,,,", "S100,Dup,InFile,,,,", "A1,Exists,InDb,,,,", "S201,BadPhone,X,,Karim,123,Father"];

  it("previews without writing, reports row errors, then commits only valid rows", async () => {
    const text = csv([...thirty, ...bad]);
    const preview = await importStudents(text, { sectionId: sectionA, commit: false }, actor());
    expect(preview).toMatchObject({ ok: true, committed: false, total: 34, validCount: 30 });
    expect((preview as { errors: unknown[] }).errors).toHaveLength(4);
    expect(await Student.countDocuments({ institutionId: schoolA, studentNumber: /^S\d+$/ })).toBe(0);

    const done = await importStudents(text, { sectionId: sectionA, commit: true }, actor());
    expect(done).toMatchObject({ ok: true, committed: true, validCount: 30 });
    expect(await Student.countDocuments({ institutionId: schoolA, studentNumber: /^S1\d\d$/ })).toBe(30);
    expect(await Enrollment.countDocuments({ institutionId: schoolA, sectionId: sectionA, studentId: { $in: (await Student.find({ institutionId: schoolA, studentNumber: /^S1\d\d$/ }).distinct("_id")) } })).toBe(30);
    expect(await Student.countDocuments({ institutionId: schoolA, studentNumber: "S200" })).toBe(0);
    // 15 distinct guardian phones shared by sibling pairs
    expect(await Guardian.countDocuments({ institutionId: schoolA, phone: /^\+8801711000/ })).toBe(15);
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "STUDENTS_IMPORTED" })).toBe(1);
  });

  it("refuses a second commit of the same file and keeps schools separate", async () => {
    expect(await importStudents(csv(thirty), { sectionId: sectionA, commit: true }, actor())).toMatchObject({ ok: false, error: "No valid rows to import" });
    expect((await importStudents(csv(thirty.slice(0, 3)), { sectionId: sectionB, commit: true }, actor(schoolB))).ok).toBe(true);
    expect(await importStudents(csv(thirty.slice(0, 1)), { sectionId: sectionB, commit: true }, actor())).toMatchObject({ ok: false, error: "Section not found" });
    expect(await importStudents("foo,bar\n1,2", { commit: false }, actor())).toMatchObject({ ok: false });
  });
});
