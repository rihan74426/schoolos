import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  AttendanceSession,
  AuditEvent,
  GradingScheme,
  InstitutionPolicy,
  Section,
  Student,
  TeachingAssignment,
} from "@schoolos/db";
import { buildInitialPolicy, gradingPresets } from "@schoolos/core";
import { submitAttendance } from "@/server/attendance";
import { saveGradingScheme, updateInstitutionPolicy } from "@/server/policy";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const schoolA = oid();
const schoolB = oid();
const teacherA = oid();
const adminA = oid();
let sectionId: string;
let studentIds: string[];

const actor = (role: string, membershipId = adminA, institutionId = schoolA) => ({ membershipId, institutionId, role });
const records = (status = "PRESENT") => studentIds.map((studentId) => ({ studentId, status }));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AttendanceSession, Student, Section, GradingScheme, InstitutionPolicy, TeachingAssignment].map((m) => m.syncIndexes()));
  const section = await Section.create({ institutionId: schoolA, academicYearId: oid(), gradeLevelId: oid(), name: "A" });
  sectionId = String(section._id);
  const students = await Student.create(
    ["1", "2"].map((n) => ({ institutionId: schoolA, studentNumber: n, firstName: "S" + n, lastName: "X", sectionId: section._id })),
  );
  studentIds = students.map((s) => String(s._id));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("submitAttendance", () => {
  const input = (extra = {}, recs = records()) => ({ sectionId, date: "2026-11-18", records: recs, ...extra });

  it("blocks a teacher with no assignment, allows once assigned", async () => {
    const denied = await submitAttendance(input(), actor("TEACHER", teacherA));
    expect(denied).toMatchObject({ ok: false, error: "You are not assigned to this section" });
    await TeachingAssignment.create({ institutionId: schoolA, membershipId: teacherA, sectionId, academicYearId: oid() });
    const ok = await submitAttendance(input({ date: "2026-11-19" }), actor("TEACHER", teacherA));
    expect(ok.ok).toBe(true);
  });

  it("first submit writes session + audit; resubmit needs a correction reason", async () => {
    const first = await submitAttendance(input(), actor("ADMIN"));
    expect(first.ok).toBe(true);
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "ATTENDANCE_SUBMITTED" })).toBeGreaterThan(0);
    const again = await submitAttendance(input({}, records("ABSENT")), actor("ADMIN"));
    expect(again).toMatchObject({ ok: false });
    expect((again as { error: string }).error).toMatch(/correction reason/);
  });

  it("stores a before/after diff on correction and rejects no-op corrections", async () => {
    const reason = "Marked wrong student by mistake";
    const fixed = await submitAttendance(input({ correctionReason: reason }, records("ABSENT")), actor("ADMIN"));
    expect(fixed.ok).toBe(true);
    const audit = (await AuditEvent.findOne({ institutionId: schoolA, action: "ATTENDANCE_CORRECTED" }).lean()) as unknown as { metadata: unknown };
    const meta = audit.metadata as { reason: string; changes: Array<{ before: { status: string }; after: { status: string } }> };
    expect(meta.reason).toBe(reason);
    expect(meta.changes[0]).toMatchObject({ before: { status: "PRESENT" }, after: { status: "ABSENT" } });
    const noop = await submitAttendance(input({ correctionReason: reason }, records("ABSENT")), actor("ADMIN"));
    expect(noop).toMatchObject({ ok: false, error: "The submitted attendance is unchanged" });
  });

  it("requires the whole roster by default", async () => {
    const partial = await submitAttendance(input({ date: "2026-12-05" }, records().slice(0, 1)), actor("ADMIN"));
    expect(partial).toMatchObject({ ok: false, error: "Mark every active student (1 of 2 marked)" });
  });

  it("closes the teacher correction window but not for admins", async () => {
    const date = "2026-12-06";
    await TeachingAssignment.create({ institutionId: schoolA, membershipId: teacherA, sectionId, academicYearId: oid() }).catch(() => null);
    expect((await submitAttendance(input({ date }), actor("TEACHER", teacherA))).ok).toBe(true);
    await AttendanceSession.collection.updateOne(
      { institutionId: schoolA, date },
      { $set: { createdAt: new Date(Date.now() - 72 * 3_600_000) } },
    );
    const late = await submitAttendance(input({ date, correctionReason: "Fix after the window" }, records("ABSENT")), actor("TEACHER", teacherA));
    expect(late).toMatchObject({ ok: false });
    expect((late as { error: string }).error).toMatch(/window has closed/);
    const byAdmin = await submitAttendance(input({ date, correctionReason: "Fix after the window" }, records("ABSENT")), actor("ADMIN"));
    expect(byAdmin.ok).toBe(true);
  });

  it("only one of two concurrent first submits wins", async () => {
    const date = "2026-12-01";
    const results = await Promise.all([
      submitAttendance(input({ date }), actor("ADMIN")),
      submitAttendance(input({ date }, records("ABSENT")), actor("ADMIN")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("does not let another institution submit for this section", async () => {
    const res = await submitAttendance(input({ date: "2026-12-02" }), actor("ADMIN", oid(), schoolB));
    expect(res).toMatchObject({ ok: false, error: "Section not found" });
  });

  it("rejects 12-character non-hex ids", async () => {
    const res = await submitAttendance({ sectionId: "abcdefghijkl", date: "2026-12-03", records: records() }, actor("ADMIN"));
    expect(res).toMatchObject({ ok: false, error: "Invalid sectionId" });
  });
});

describe("policy service", () => {
  it("saves a custom default grading scheme, then updates policy with version check + audit", async () => {
    const preset = gradingPresets["gpa-5"];
    expect((await saveGradingScheme(preset, { makeDefault: true }, actor("OWNER"))).ok).toBe(true);
    const custom = { key: "mine", name: "Mine", passPercent: 30, bands: [{ label: "Pass", minPercent: 30 }] };
    expect((await saveGradingScheme(custom, { makeDefault: true }, actor("OWNER"))).ok).toBe(true);
    expect(await GradingScheme.countDocuments({ institutionId: schoolA, isDefault: true })).toBe(1);

    await InstitutionPolicy.create({ institutionId: schoolA, policy: buildInitialPolicy("bd-school") });
    const next = { ...buildInitialPolicy("bd-school"), gradingSchemeKey: "mine" };
    expect(await updateInstitutionPolicy(next, 1, actor("OWNER"))).toEqual({ ok: true, version: 2 });
    const stale = await updateInstitutionPolicy(next, 1, actor("OWNER"));
    expect(stale).toMatchObject({ ok: false });
    expect(await updateInstitutionPolicy({ ...next, gradingSchemeKey: "ghost" }, 2, actor("OWNER"))).toMatchObject({ ok: false, error: "Unknown grading scheme" });
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "POLICY_UPDATED" })).toBe(1);
  });
});
