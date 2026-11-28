import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AcademicYear, AttendanceSession, GradeLevel, Section, Student, TeachingAssignment } from "@schoolos/db";
import { getRoster, sectionsMissingAttendance, submitAttendance } from "@/server/attendance";
import { todayInDhaka } from "@/server/dates";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const schoolA = oid();
const schoolB = oid();
const teacher = oid();
const stranger = oid();
const admin = oid();
let yearId: mongoose.Types.ObjectId;
let secA: string;
let secB: string;
let secEmpty: string;
let studentsA: string[];

const as = (role: string, membershipId = admin, institutionId = schoolA) => ({ membershipId, institutionId, role });
const today = todayInDhaka();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AttendanceSession, Student, Section, TeachingAssignment, AcademicYear, GradeLevel].map((m) => m.syncIndexes()));
  yearId = oid();
  await AcademicYear.create({ _id: yearId, institutionId: schoolA, name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  const level = await GradeLevel.create({ institutionId: schoolA, name: "Class 6", order: 6 });
  const [a, b, empty] = await Section.create(
    ["A", "B", "C"].map((name) => ({ institutionId: schoolA, academicYearId: yearId, gradeLevelId: level._id, name })),
  );
  [secA, secB, secEmpty] = [a, b, empty].map((s) => String(s._id));
  const made = await Student.create([
    { institutionId: schoolA, studentNumber: "2", firstName: "Bea", lastName: "Z", sectionId: a._id },
    { institutionId: schoolA, studentNumber: "1", firstName: "Abu", sectionId: a._id },
    { institutionId: schoolA, studentNumber: "3", firstName: "Gone", sectionId: a._id, status: "WITHDRAWN" },
    { institutionId: schoolA, studentNumber: "9", firstName: "Other", lastName: "Sec", sectionId: b._id },
  ]);
  studentsA = [made[1], made[0]].map((s) => String(s._id)); // ordered by studentNumber
  await TeachingAssignment.create({ institutionId: schoolA, membershipId: teacher, sectionId: a._id, academicYearId: yearId });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("getRoster", () => {
  it("returns active students only, sorted, with null status before submit", async () => {
    const roster = await getRoster(as("TEACHER", teacher), secA, today);
    expect(roster?.students.map((s) => [s.number, s.name, s.status])).toEqual([
      ["1", "Abu", null],
      ["2", "Bea Z", null],
    ]);
    expect(roster?.session).toBeNull();
    expect(roster?.requireFullRoster).toBe(true);
  });

  it("blocks an unassigned teacher and other tenants, but lets leadership in", async () => {
    expect(await getRoster(as("TEACHER", stranger), secA, today)).toBeNull();
    expect(await getRoster(as("TEACHER", teacher), secB, today)).toBeNull();
    expect(await getRoster(as("ADMIN", admin, schoolB), secA, today)).toBeNull();
    expect(await getRoster(as("ADMIN"), secB, today)).not.toBeNull();
  });

  it("rejects bad ids, fake dates, future dates and roles without attendance:submit", async () => {
    expect(await getRoster(as("ADMIN"), "abcdefghijkl", today)).toBeNull();
    expect(await getRoster(as("ADMIN"), secA, "2026-02-30")).toBeNull();
    expect(await getRoster(as("ADMIN"), secA, "2999-01-01")).toBeNull();
    expect(await getRoster(as("ACCOUNTS"), secA, today)).toBeNull();
  });

  it("shows submitted entries and the correction state", async () => {
    const records = studentsA.map((studentId, i) => ({ studentId, status: i ? "ABSENT" : "PRESENT" }));
    expect((await submitAttendance({ sectionId: secA, date: today, records }, as("TEACHER", teacher))).ok).toBe(true);
    const roster = await getRoster(as("TEACHER", teacher), secA, today);
    expect(roster?.students.map((s) => s.status)).toEqual(["PRESENT", "ABSENT"]);
    expect(roster?.session?.canCorrect).toBe(true);
  });

  it("closes the correction window for teachers but not for leadership", async () => {
    const old = "2026-09-01";
    await submitAttendance({ sectionId: secA, date: old, records: studentsA.map((studentId) => ({ studentId, status: "PRESENT" })) }, as("TEACHER", teacher));
    await AttendanceSession.collection.updateOne(
      { institutionId: schoolA, sectionId: new mongoose.Types.ObjectId(secA), date: old },
      { $set: { createdAt: new Date(Date.now() - 100 * 3_600_000) } },
    );
    expect((await getRoster(as("TEACHER", teacher), secA, old))?.session?.canCorrect).toBe(false);
    expect((await getRoster(as("ADMIN"), secA, old))?.session?.canCorrect).toBe(true);
  });
});

describe("submitAttendance dates", () => {
  it("rejects a future date", async () => {
    const res = await submitAttendance({ sectionId: secB, date: "2999-01-01", records: [{ studentId: String(oid()), status: "PRESENT" }] }, as("ADMIN"));
    expect(res).toMatchObject({ ok: false, error: "Cannot take attendance for a future date" });
  });
});

describe("sectionsMissingAttendance", () => {
  it("lists only assigned sections without a submission, skipping empty ones", async () => {
    const day = "2026-10-15";
    expect((await sectionsMissingAttendance(as("TEACHER", teacher), day)).map((s) => s.id)).toEqual([secA]);
    expect((await sectionsMissingAttendance(as("TEACHER", stranger), day)).length).toBe(0);
    const admins = (await sectionsMissingAttendance(as("ADMIN"), day)).map((s) => s.id);
    expect(admins.sort()).toEqual([secA, secB].sort());
    expect(admins).not.toContain(secEmpty);

    await submitAttendance({ sectionId: secA, date: day, records: studentsA.map((studentId) => ({ studentId, status: "PRESENT" })) }, as("TEACHER", teacher));
    expect(await sectionsMissingAttendance(as("TEACHER", teacher), day)).toEqual([]);
    expect((await sectionsMissingAttendance(as("ADMIN"), day)).map((s) => s.id)).toEqual([secB]);
    expect(await sectionsMissingAttendance(as("ACCOUNTS"), day)).toEqual([]);
  });

  it("subject-only teacher gets no sections", async () => {
    const subjectTeacher = oid();
    await TeachingAssignment.create({ institutionId: schoolA, membershipId: subjectTeacher, sectionId: secB, academicYearId: yearId, subjectId: oid() });
    expect(await sectionsMissingAttendance(as("TEACHER", subjectTeacher), "2026-01-05")).toEqual([]);
  });
});
