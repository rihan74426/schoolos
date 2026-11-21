import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AcademicYear, AttendanceSession, AuditEvent, GradeLevel, Guardian, Institution, MessagingChannel, NotificationJob, Section, Student, TeachingAssignment } from "@schoolos/db";
import { submitAttendance } from "@/server/attendance";
import { saveChannel, setAlertLocale } from "@/server/messaging";
import { enqueueAbsenceAlerts, listNotifications, processInstitutionQueue } from "@/server/notifications";
import { setGuardianConsent } from "@/server/students";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const as = (institutionId: mongoose.Types.ObjectId, role = "ADMIN", membershipId = oid()) => ({ membershipId, institutionId, role });
let schoolA: mongoose.Types.ObjectId;
let schoolB: mongoose.Types.ObjectId;
let section: string;
let kids: Record<string, string>;
const yesterday = new Date(Date.now() - 24 * 3_600_000 + 6 * 3_600_000).toISOString().slice(0, 10);

async function guardianFor(studentId: string, phone: string, sms: boolean) {
  return Guardian.create({ institutionId: schoolA, fullName: "Parent " + phone.slice(-3), phone, consent: { sms }, studentLinks: [{ studentId, relationship: "Father" }] });
}

beforeAll(async () => {
  process.env.MESSAGING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([NotificationJob, MessagingChannel, Guardian, AttendanceSession, Student].map((m) => m.syncIndexes()));
  schoolA = (await Institution.create({ name: "Nur Madrasa", slug: "nur-a" }))._id;
  schoolB = (await Institution.create({ name: "Other School", slug: "other-b" }))._id;
  const year = await AcademicYear.create({ institutionId: schoolA, name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  const level = await GradeLevel.create({ institutionId: schoolA, name: "Class 5", order: 5 });
  const sec = await Section.create({ institutionId: schoolA, academicYearId: year._id, gradeLevelId: level._id, name: "A" });
  section = String(sec._id);
  const made = await Student.create(
    ["consent", "noconsent", "present", "retry", "permanent"].map((n, i) => ({ institutionId: schoolA, studentNumber: String(i + 1), firstName: n, sectionId: sec._id })),
  );
  kids = Object.fromEntries(made.map((s) => [s.firstName, String(s._id)]));
  await guardianFor(kids.consent, "01711111111", true);
  await guardianFor(kids.noconsent, "01722222222", false);
  await guardianFor(kids.present, "01733333333", true);
  await guardianFor(kids.retry, "01744444999", true);
  await guardianFor(kids.permanent, "01755555000", true);
  await TeachingAssignment.create({ institutionId: schoolA, membershipId: oid(), sectionId: sec._id, academicYearId: year._id });
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const records = (absent: string[]) => Object.entries(kids).map(([name, studentId]) => ({ studentId, status: absent.includes(name) ? "ABSENT" : "PRESENT" }));

describe("absence alerts", () => {
  it("queues nothing without an active channel", async () => {
    expect(await enqueueAbsenceAlerts(schoolA, { sessionId: "s0", date: yesterday, absentStudentIds: [kids.consent] })).toEqual({ queued: 0 });
  });

  it("queues only for ABSENT students whose guardian opted in, and never blocks attendance", async () => {
    await saveChannel({ kind: "SMS", provider: "FAKE" }, as(schoolA));
    const res = await submitAttendance({ sectionId: section, date: yesterday, records: records(["consent", "noconsent", "retry", "permanent"]) }, as(schoolA));
    expect(res.ok).toBe(true);
    const jobs = (await NotificationJob.find({ institutionId: schoolA }).lean()) as unknown as Array<{ to: string; text: string; status: string }>;
    expect(jobs.map((j) => j.to).sort()).toEqual(["+8801711111111", "+8801744444999", "+8801755555000"]);
    expect(jobs.every((j) => j.status === "QUEUED")).toBe(true);
    expect(jobs.find((j) => j.to === "+8801711111111")?.text).toBe(`Dear guardian, consent was absent from Nur Madrasa on ${yesterday}.`);
  });

  it("writes the alert in Bangla when the school language is Bangla", async () => {
    expect(await setAlertLocale("fr", as(schoolA))).toMatchObject({ ok: false });
    expect(await setAlertLocale("bn", as(schoolA))).toEqual({ ok: true });
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "ALERT_LOCALE_CHANGED" })).toBe(1);
    expect(await setAlertLocale("bn", as(schoolA))).toEqual({ ok: true }); // no-op, no second audit
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "ALERT_LOCALE_CHANGED" })).toBe(1);
    await enqueueAbsenceAlerts(schoolA, { sessionId: "bn-session", date: yesterday, absentStudentIds: [kids.consent] });
    const job = (await NotificationJob.findOne({ institutionId: schoolA, idempotencyKey: { $regex: "^absence:bn-session" } }).lean()) as unknown as { text: string; segments: number };
    expect(job.text).toContain("অনুপস্থিত");
    expect(job.text).toContain("Nur Madrasa");
    expect(job.segments).toBeGreaterThanOrEqual(1);
    await setAlertLocale("en", as(schoolA));
  });

  it("does not re-send when attendance is corrected", async () => {
    const before = await NotificationJob.countDocuments({ institutionId: schoolA });
    const fix = await submitAttendance({ sectionId: section, date: yesterday, correctionReason: "Marked wrong student earlier", records: records(["consent", "noconsent", "retry", "permanent", "present"]) }, as(schoolA));
    expect(fix.ok).toBe(true);
    // only the newly absent student with consent adds a job
    expect(await NotificationJob.countDocuments({ institutionId: schoolA })).toBe(before + 1);
    const again = await enqueueAbsenceAlerts(schoolA, { sessionId: "same", date: yesterday, absentStudentIds: [kids.consent] });
    const twice = await enqueueAbsenceAlerts(schoolA, { sessionId: "same", date: yesterday, absentStudentIds: [kids.consent] });
    expect(again.queued).toBe(1);
    expect(twice.queued).toBe(0);
  });
});

describe("queue processing", () => {
  it("sends, retries with backoff, and fails permanently", async () => {
    const now = new Date();
    const stats = await processInstitutionQueue(schoolA, { now });
    expect(stats.sent).toBeGreaterThanOrEqual(2);
    expect(stats.retried).toBe(1);
    expect(stats.failed).toBe(1);
    const retry = (await NotificationJob.findOne({ institutionId: schoolA, to: "+8801744444999" }).lean()) as unknown as { status: string; attempts: number; nextAttemptAt: Date };
    expect(retry).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    const perm = (await NotificationJob.findOne({ institutionId: schoolA, to: "+8801755555000" }).lean()) as unknown as { status: string; lastError: string };
    expect(perm.status).toBe("FAILED");
    expect(perm.lastError).toContain("invalid number");
  });

  it("gives up after the maximum attempts", async () => {
    let t = Date.now();
    for (let i = 0; i < 6; i += 1) {
      t += 2 * 3_600_000;
      await processInstitutionQueue(schoolA, { now: new Date(t) });
    }
    expect(await NotificationJob.findOne({ institutionId: schoolA, to: "+8801744444999" }).lean()).toMatchObject({ status: "FAILED", attempts: 5 });
  });

  it("polls SENT jobs to DELIVERED", async () => {
    await NotificationJob.create({ institutionId: schoolA, idempotencyKey: "poll-1", kind: "ABSENCE_ALERT", to: "+8801788888111", text: "x", status: "SENT", providerId: "fake-poll", sentAt: new Date() });
    const stats = await processInstitutionQueue(schoolA, { now: new Date(Date.now() + 10 * 60_000) });
    expect(stats.delivered).toBeGreaterThanOrEqual(1);
    expect(await NotificationJob.findOne({ institutionId: schoolA, idempotencyKey: "poll-1" }).lean()).toMatchObject({ status: "DELIVERED" });
  });

  it("two overlapping workers never send a job twice", async () => {
    const key = "race-1";
    await NotificationJob.create({ institutionId: schoolA, idempotencyKey: key, kind: "ABSENCE_ALERT", to: "+8801799999111", text: "x", status: "QUEUED" });
    await Promise.all([processInstitutionQueue(schoolA), processInstitutionQueue(schoolA)]);
    expect(await NotificationJob.findOne({ institutionId: schoolA, idempotencyKey: key }).lean()).toMatchObject({ attempts: 1 });
  });

  it("recovers jobs stuck in SENDING", async () => {
    await NotificationJob.create({ institutionId: schoolA, idempotencyKey: "stuck-1", kind: "ABSENCE_ALERT", to: "+8801799999222", text: "x", status: "SENDING", lockedAt: new Date(Date.now() - 3_600_000) });
    await processInstitutionQueue(schoolA);
    expect((await NotificationJob.findOne({ institutionId: schoolA, idempotencyKey: "stuck-1" }).lean() as unknown as { status: string }).status).not.toBe("SENDING");
  });

  it("does nothing for a school without a channel, and never touches other schools", async () => {
    await NotificationJob.create({ institutionId: schoolB, idempotencyKey: "b-1", kind: "ABSENCE_ALERT", to: "+8801700000001", text: "x", status: "QUEUED" });
    expect(await processInstitutionQueue(schoolB)).toEqual({ sent: 0, retried: 0, failed: 0, delivered: 0 });
    await processInstitutionQueue(schoolA);
    expect(await NotificationJob.findOne({ institutionId: schoolB, idempotencyKey: "b-1" }).lean()).toMatchObject({ status: "QUEUED", attempts: 0 });
  });
});

describe("delivery log", () => {
  it("is tenant-scoped and masks phone numbers", async () => {
    const log = await listNotifications(as(schoolA));
    expect(log.total).toBeGreaterThan(3);
    expect(log.rows.every((r) => !/\d{11}/.test(r.to))).toBe(true);
    expect(log.rows.some((r) => r.student === "consent")).toBe(true);
    const other = await listNotifications(as(schoolB));
    expect(other.total).toBe(1);
  });
});

describe("guardian consent", () => {
  it("toggles with an audit event, rejects strangers and missing phones", async () => {
    const g = (await Guardian.findOne({ institutionId: schoolA, phone: "01722222222" }).lean()) as unknown as { _id: unknown };
    expect(await setGuardianConsent({ studentId: kids.noconsent, guardianId: String(g._id), sms: true, source: "VERBAL" }, as(schoolB))).toMatchObject({ ok: false });
    expect(await setGuardianConsent({ studentId: kids.noconsent, guardianId: String(g._id), sms: true }, as(schoolA))).toMatchObject({ ok: false, error: "Choose how the guardian agreed" });
    expect(await setGuardianConsent({ studentId: kids.noconsent, guardianId: String(g._id), sms: true, source: "MADE_UP" }, as(schoolA))).toMatchObject({ ok: false });
    expect(await setGuardianConsent({ studentId: kids.noconsent, guardianId: String(g._id), sms: true, source: "WRITTEN_FORM" }, as(schoolA))).toEqual({ ok: true });
    expect(await Guardian.findOne({ institutionId: schoolA, phone: "01722222222" }).lean()).toMatchObject({ consent: { sms: true, source: "WRITTEN_FORM" } });
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "GUARDIAN_SMS_CONSENT_UPDATED" })).toBe(1);
    expect(await setGuardianConsent({ studentId: kids.noconsent, guardianId: String(g._id), sms: true, source: "WRITTEN_FORM" }, as(schoolA))).toEqual({ ok: true }); // no-op
    expect(await AuditEvent.countDocuments({ institutionId: schoolA, action: "GUARDIAN_SMS_CONSENT_UPDATED" })).toBe(1);
    expect(await setGuardianConsent({ studentId: kids.consent, guardianId: String(g._id), sms: false }, as(schoolA))).toMatchObject({ ok: false }); // not linked to that student
  });
});
