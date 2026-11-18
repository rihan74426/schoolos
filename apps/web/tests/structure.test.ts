import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AcademicYear, AuditEvent, GradeLevel, Membership, Section, TeachingAssignment } from "@schoolos/db";
import {
  assignTeacher,
  createAcademicYear,
  createGradeLevel,
  createSection,
  endTeacherAssignment,
  setCurrentAcademicYear,
} from "@/server/structure";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const schoolA = oid();
const schoolB = oid();
const actor = (institutionId = schoolA) => ({ membershipId: oid(), institutionId, role: "ADMIN" });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AcademicYear, GradeLevel, Section, Membership, TeachingAssignment].map((m) => m.syncIndexes()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("academic structure", () => {
  it("keeps exactly one current year per institution", async () => {
    const a = await createAcademicYear({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", makeCurrent: true }, actor());
    const b = await createAcademicYear({ name: "2027", startsOn: "2027-01-01", endsOn: "2027-12-31", makeCurrent: true }, actor());
    expect(a.ok && b.ok).toBe(true);
    expect(await AcademicYear.countDocuments({ institutionId: schoolA, isCurrent: true })).toBe(1);
    expect((await setCurrentAcademicYear((a as { id: string }).id, actor())).ok).toBe(true);
    const current = (await AcademicYear.findOne({ institutionId: schoolA, isCurrent: true }).lean()) as unknown as { name: string };
    expect(current.name).toBe("2026");
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "ACADEMIC_YEAR_SET_CURRENT" })).toBe(1);
  });

  it("rejects duplicates and bad dates", async () => {
    expect(await createAcademicYear({ name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }, actor())).toMatchObject({ ok: false, error: "That name already exists" });
    expect((await createAcademicYear({ name: "bad", startsOn: "2026-12-31", endsOn: "2026-01-01" }, actor())).ok).toBe(false);
  });

  it("creates sections only from this institution's year and class", async () => {
    const year = await AcademicYear.findOne({ institutionId: schoolA }).lean() as { _id: unknown };
    const level = await createGradeLevel({ name: "Class 6" }, actor());
    expect(level.ok).toBe(true);
    const ok = await createSection({ academicYearId: String(year._id), gradeLevelId: (level as { id: string }).id, name: "A" }, actor());
    expect(ok.ok).toBe(true);
    const cross = await createSection({ academicYearId: String(year._id), gradeLevelId: (level as { id: string }).id, name: "B" }, actor(schoolB));
    expect(cross).toMatchObject({ ok: false, error: "Academic year or grade level not found" });
  });

  it("assigns and ends teachers; rejects non-teachers and other tenants", async () => {
    const section = await Section.findOne({ institutionId: schoolA }).lean() as { _id: unknown };
    const teacher = await Membership.create({ institutionId: schoolA, clerkUserId: "user_t", role: "TEACHER" });
    const admin = await Membership.create({ institutionId: schoolA, clerkUserId: "user_a", role: "ADMIN" });
    const input = { membershipId: String(teacher._id), sectionId: String(section._id) };
    const first = await assignTeacher(input, actor());
    expect(first.ok).toBe(true);
    expect(await assignTeacher(input, actor())).toMatchObject({ ok: false, error: "Teacher is already assigned to this section" });
    expect(await assignTeacher({ ...input, membershipId: String(admin._id) }, actor())).toMatchObject({ ok: false, error: "Teacher not found" });
    expect(await assignTeacher(input, actor(schoolB))).toMatchObject({ ok: false });
    expect((await endTeacherAssignment((first as { id: string }).id, actor(schoolB))).ok).toBe(false);
    expect((await endTeacherAssignment((first as { id: string }).id, actor())).ok).toBe(true);
    expect(await TeachingAssignment.countDocuments({ institutionId: schoolA, status: "ACTIVE" })).toBe(0);
  });
});
