import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AcademicYear, AuditEvent, Enrollment, GradeLevel, Guardian, Membership, Section, Student, TeachingAssignment } from "@schoolos/db";
import { addGuardian, createStudent, enrollStudent, getStudentProfile, importStudents, listCurrentSections, listStudents, setStudentStatus, updateStudent } from "@/server/students";

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
    const profile = await getStudentProfile(actor(), (res as { id: string }).id);
    expect(String(profile?.student.sectionId)).toBe(sectionA);
    expect(profile?.enrollments).toHaveLength(1);
    expect(profile?.guardians[0]).toMatchObject({ fullName: "Karim Rahman", phone: "+8801712345678" });
    expect(profile?.guardians[0].studentLinks[0].isPrimary).toBe(true);
    expect(await createStudent({ studentNumber: "A1", firstName: "X", lastName: "Y" }, undefined, actor())).toMatchObject({ ok: false, error: "That student number already exists" });
    expect((await createStudent({ studentNumber: "A1", firstName: "X", lastName: "Y" }, undefined, actor(schoolB))).ok).toBe(true);
    expect(await getStudentProfile(actor(schoolB), (res as { id: string }).id)).toBeNull();
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
    expect((await listCurrentSections(actor())).map((s) => s.label).sort()).toEqual(["Class 6 – A", "Class 6 – B"]);
  });

  it("searches safely and per school", async () => {
    expect((await listStudents(actor(), { q: "abd" })).rows.map((r) => r.studentNumber)).toEqual(["A1"]);
    expect((await listStudents(actor(), { q: "(" })).rows).toEqual([]); // regex metacharacters are escaped
    expect((await listStudents(actor(schoolB), { q: "abd" })).rows).toEqual([]);
    expect((await listStudents(actor(), { sectionId: sectionA })).total).toBeGreaterThan(0);
  });
});

describe("teacher scoping", () => {
  it("shows a teacher only students in assigned sections, and hides the rest as not found", async () => {
    const teacher = await Membership.create({ institutionId: schoolA, clerkUserId: "user_scope_t", role: "TEACHER" });
    const stranger = await Membership.create({ institutionId: schoolA, clerkUserId: "user_scope_x", role: "TEACHER" });
    await TeachingAssignment.create({ institutionId: schoolA, membershipId: teacher._id, sectionId: sectionA, academicYearId: oid() });
    const asTeacher = { membershipId: teacher._id, institutionId: schoolA, role: "TEACHER" };
    const asStranger = { membershipId: stranger._id, institutionId: schoolA, role: "TEACHER" };

    expect((await listStudents(asTeacher, {})).rows.map((r) => r.studentNumber)).toEqual(["A1"]);
    expect((await listStudents(asTeacher, { sectionId: sectionA2 })).rows).toEqual([]); // cannot widen via the filter
    expect((await listStudents(asStranger, {})).total).toBe(0);
    expect((await listStudents(actor(), {})).total).toBeGreaterThan(1);
    expect((await listStudents({ ...actor(), role: "ACCOUNTS" }, {})).total).toBeGreaterThan(1);

    const a1 = (await Student.findOne({ institutionId: schoolA, studentNumber: "A1" }).lean()) as unknown as { _id: unknown };
    const t1 = (await Student.findOne({ institutionId: schoolA, studentNumber: "T1" }).lean()) as unknown as { _id: unknown };
    expect(await getStudentProfile(asTeacher, String(a1._id))).not.toBeNull();
    expect(await getStudentProfile(asTeacher, String(t1._id))).toBeNull(); // in sectionA2
    expect(await getStudentProfile(asStranger, String(a1._id))).toBeNull();
    expect((await listCurrentSections(asTeacher)).map((s) => s.label)).toEqual(["Class 6 – A"]);
  });
});

describe("guardians and single names", () => {
  it("never creates two guardians for one phone, even for simultaneous requests", async () => {
    const x = (await createStudent({ studentNumber: "RC1", firstName: "R", lastName: "One" }, undefined, actor())) as { id: string };
    const y = (await createStudent({ studentNumber: "RC2", firstName: "R", lastName: "Two" }, undefined, actor())) as { id: string };
    const phone = "01955555555";
    const results = await Promise.all([
      addGuardian({ studentId: x.id, guardian: { fullName: "Race Parent", phone, relationship: "Father" } }, actor()),
      addGuardian({ studentId: y.id, guardian: { fullName: "Race Parent", phone, relationship: "Father" } }, actor()),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const docs = (await Guardian.find({ institutionId: schoolA, phone: "+8801955555555" }).lean()) as unknown as Array<{ studentLinks: unknown[] }>;
    expect(docs).toHaveLength(1);
    expect(docs[0].studentLinks).toHaveLength(2);
  });

  it("accepts a student with only one name", async () => {
    const res = (await createStudent({ studentNumber: "ONE1", firstName: "Abdullah" }, undefined, actor())) as { id: string };
    expect(res.id).toBeTruthy();
    expect((await getStudentProfile(actor(), res.id))?.student.lastName).toBe("");
  });
});

describe("student lifecycle", () => {
  it("edits with a before/after audit and stays tenant-scoped", async () => {
    const made = (await createStudent({ studentNumber: "ED1", firstName: "Old", lastName: "Name", dateOfBirth: "2014-01-01" }, undefined, actor())) as { id: string };
    expect(await updateStudent({ studentId: made.id, firstName: "New", lastName: "", dateOfBirth: "" }, actor(schoolB))).toMatchObject({ ok: false, error: "Student not found" });
    expect(await updateStudent({ studentId: made.id, firstName: "New", lastName: "", dateOfBirth: "" }, actor())).toEqual({ ok: true });
    const profile = await getStudentProfile(actor(), made.id);
    expect(profile?.student).toMatchObject({ firstName: "New", lastName: "" });
    expect(profile?.student.dateOfBirth).toBeUndefined();
    const audit = (await AuditEvent.findOne({ institutionId: schoolA, action: "STUDENT_UPDATED", entityId: made.id }).lean()) as unknown as { metadata: { before: { firstName: string }; after: { firstName: string } } };
    expect(audit.metadata.before.firstName).toBe("Old");
    expect(audit.metadata.after.firstName).toBe("New");
  });

  it("withdraws (closing enrollment), hides from the default list, then reactivates and re-enrolls", async () => {
    const made = (await createStudent({ studentNumber: "WD1", firstName: "Leaving", lastName: "Student" }, sectionA, actor())) as { id: string };
    expect(await setStudentStatus({ studentId: made.id, status: "WITHDRAWN" }, actor(schoolB))).toMatchObject({ ok: false });
    expect(await setStudentStatus({ studentId: made.id, status: "WITHDRAWN" }, actor())).toEqual({ ok: true, changed: true });
    expect(await setStudentStatus({ studentId: made.id, status: "WITHDRAWN" }, actor())).toEqual({ ok: true, changed: false });

    const gone = (await Student.findOne({ institutionId: schoolA, _id: made.id }).lean()) as unknown as { status: string; sectionId?: unknown };
    expect(gone.status).toBe("WITHDRAWN");
    expect(gone.sectionId).toBeUndefined();
    const enr = (await Enrollment.findOne({ institutionId: schoolA, studentId: made.id }).lean()) as unknown as { status: string; endsOn?: string };
    expect(enr).toMatchObject({ status: "WITHDRAWN" });
    expect(enr.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await listStudents(actor(), { q: "WD1" })).total).toBe(0);
    expect((await listStudents(actor(), { q: "WD1", status: "WITHDRAWN" })).total).toBe(1);
    expect(await enrollStudent({ studentId: made.id, sectionId: sectionA }, actor())).toMatchObject({ ok: false, error: "Student not found" });

    expect(await setStudentStatus({ studentId: made.id, status: "ACTIVE" }, actor())).toEqual({ ok: true, changed: true });
    expect(await enrollStudent({ studentId: made.id, sectionId: sectionA2 }, actor())).toEqual({ ok: true, changed: true });
    expect(await Enrollment.countDocuments({ institutionId: schoolA, studentId: made.id })).toBe(1);
    const back = (await Enrollment.findOne({ institutionId: schoolA, studentId: made.id }).lean()) as unknown as { status: string; endsOn?: string };
    expect(back.status).toBe("ACTIVE");
    expect(back.endsOn).toBeUndefined();
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, entityId: made.id, action: { $in: ["STUDENT_WITHDRAWN", "STUDENT_REACTIVATED"] } })).toBe(2);
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

  it("commits nothing when the chosen section does not exist", async () => {
    const ghost = String(oid());
    const rows = csv(["NS1,No,Section,,,,"]);
    expect(await importStudents(rows, { sectionId: ghost, commit: true }, actor())).toMatchObject({ ok: false, error: "Section not found" });
    expect(await Student.countDocuments({ institutionId: schoolA, studentNumber: "NS1" })).toBe(0);
  });

  it("undoes a half-finished import so no orphan students, guardians or enrollments remain", async () => {
    const spy = vi.spyOn(Enrollment, "insertMany").mockRejectedValueOnce(new Error("boom"));
    const rows = csv(["RB1,Roll,Back,,Parent One,01933333331,Father", "RB2,Roll,Back,,Parent Two,01933333332,Mother"]);
    await expect(importStudents(rows, { sectionId: sectionA, commit: true }, actor())).rejects.toThrow("boom");
    spy.mockRestore();
    expect(await Student.countDocuments({ institutionId: schoolA, studentNumber: { $in: ["RB1", "RB2"] } })).toBe(0);
    expect(await Guardian.countDocuments({ institutionId: schoolA, phone: { $in: ["+8801933333331", "+8801933333332"] } })).toBe(0);
    // and the same file imports cleanly afterwards
    expect((await importStudents(rows, { sectionId: sectionA, commit: true }, actor())).ok).toBe(true);
  });
});
