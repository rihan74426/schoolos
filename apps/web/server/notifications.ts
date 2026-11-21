import "server-only";
import { DEFAULT_ABSENCE_TEMPLATES, normalizeBdPhone, renderTemplate, smsSegments } from "@schoolos/core";
import { Guardian, Institution, MessagingChannel, NotificationJob, Student } from "@schoolos/db";
import { loadProvider } from "./messaging";
import type { Actor } from "./auth";

const MAX_ATTEMPTS = 5;
const STALE_LOCK_MS = 5 * 60_000;
const POLL_EVERY_MS = 5 * 60_000;
const POLL_WINDOW_MS = 24 * 3_600_000;
const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000; // 2, 4, 8, 16, 32 min

/**
 * Queue absence alerts for the ABSENT students of a submitted session. Only guardians who opted in
 * to SMS and have a valid phone; only when the school has an active SMS channel. Idempotent per
 * (session, student, guardian), so corrections never re-send.
 */
export async function enqueueAbsenceAlerts(
  institutionId: unknown,
  input: { sessionId: string; date: string; absentStudentIds: string[] },
) {
  if (!input.absentStudentIds.length) return { queued: 0 };
  if (!(await MessagingChannel.exists({ institutionId, kind: "SMS", active: true }))) return { queued: 0 };

  const [school, students, guardians] = await Promise.all([
    Institution.findOne({ _id: institutionId }).select("name defaultLocale").lean() as unknown as Promise<{ name: string; defaultLocale?: string } | null>,
    Student.find({ institutionId, _id: { $in: input.absentStudentIds } }).lean() as unknown as Promise<Array<{ _id: unknown; firstName: string; lastName?: string }>>,
    Guardian.find({ institutionId, "consent.sms": true, "studentLinks.studentId": { $in: input.absentStudentIds } }).lean() as unknown as Promise<
      Array<{ _id: unknown; phone?: string; studentLinks: Array<{ studentId: unknown }> }>
    >,
  ]);
  const schoolName = school?.name ?? "school";
  // Template follows the school's language; Arabic has no template yet, so it falls back to English.
  const template = school?.defaultLocale === "bn" ? DEFAULT_ABSENCE_TEMPLATES.bn : DEFAULT_ABSENCE_TEMPLATES.en;
  let queued = 0;
  for (const student of students) {
    const sid = String(student._id);
    const seenPhones = new Set<string>();
    for (const guardian of guardians) {
      if (!guardian.studentLinks.some((l) => String(l.studentId) === sid)) continue;
      const to = guardian.phone ? normalizeBdPhone(guardian.phone) : null;
      if (!to || seenPhones.has(to)) continue;
      seenPhones.add(to);
      const text = renderTemplate(template, {
        student: [student.firstName, student.lastName].filter(Boolean).join(" "),
        school: schoolName,
        date: input.date,
      });
      const key = `absence:${input.sessionId}:${sid}:${String(guardian._id)}`;
      const res = await NotificationJob.updateOne(
        { institutionId, idempotencyKey: key },
        { $setOnInsert: { institutionId, idempotencyKey: key, kind: "ABSENCE_ALERT", channel: "SMS", studentId: student._id, guardianId: guardian._id, to, text, segments: smsSegments(text).segments, status: "QUEUED", attempts: 0, nextAttemptAt: new Date() } },
        { upsert: true },
      );
      if (res.upsertedCount) queued += 1;
    }
  }
  return { queued };
}

/** Send due jobs for one school. Claims are atomic, so overlapping workers never double-send a job. */
export async function processInstitutionQueue(institutionId: unknown, opts: { now?: Date; batch?: number } = {}) {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? 50;
  const stats = { sent: 0, retried: 0, failed: 0, delivered: 0 };

  // A worker that died mid-send leaves SENDING jobs behind; put them back.
  await NotificationJob.updateMany(
    { institutionId, status: "SENDING", lockedAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    { $set: { status: "QUEUED" } },
  );

  const provider = await loadProvider(institutionId);
  if (!provider) return stats;

  for (let i = 0; i < batch; i += 1) {
    const job = (await NotificationJob.findOneAndUpdate(
      { institutionId, status: "QUEUED", nextAttemptAt: { $lte: now } },
      { $set: { status: "SENDING", lockedAt: now }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    ).lean()) as { _id: unknown; to: string; text: string; attempts: number } | null;
    if (!job) break;

    const result = await provider.send({ to: job.to, text: job.text });
    if (result.ok) {
      await NotificationJob.updateOne({ _id: job._id, institutionId }, { $set: { status: "SENT", providerId: result.providerId, sentAt: new Date(), lastError: "" }, $unset: { lockedAt: 1 } });
      stats.sent += 1;
    } else if (!result.retryable || job.attempts >= MAX_ATTEMPTS) {
      await NotificationJob.updateOne({ _id: job._id, institutionId }, { $set: { status: "FAILED", lastError: result.error.slice(0, 300) }, $unset: { lockedAt: 1 } });
      stats.failed += 1;
    } else {
      await NotificationJob.updateOne(
        { _id: job._id, institutionId },
        { $set: { status: "QUEUED", lastError: result.error.slice(0, 300), nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts)) }, $unset: { lockedAt: 1 } },
      );
      stats.retried += 1;
    }
  }

  // Providers without webhooks (sms.net.bd): poll recent SENT jobs for a final state.
  const pollable = (await NotificationJob.find({
    institutionId,
    status: "SENT",
    providerId: { $exists: true },
    sentAt: { $gte: new Date(now.getTime() - POLL_WINDOW_MS) },
    $or: [{ lastPolledAt: { $exists: false } }, { lastPolledAt: { $lt: new Date(now.getTime() - POLL_EVERY_MS) } }],
  })
    .limit(batch)
    .lean()) as unknown as Array<{ _id: unknown; providerId: string }>;
  for (const job of pollable) {
    const res = await provider.status(job.providerId);
    const set: Record<string, unknown> = { lastPolledAt: now };
    if (res.ok && res.state === "DELIVERED") Object.assign(set, { status: "DELIVERED", deliveredAt: now });
    if (res.ok && res.state === "FAILED") Object.assign(set, { status: "FAILED", lastError: "Provider reported delivery failure" });
    await NotificationJob.updateOne({ _id: job._id, institutionId }, { $set: set });
    if (set.status === "DELIVERED") stats.delivered += 1;
    if (set.status === "FAILED") stats.failed += 1;
  }
  return stats;
}

/** Cron entry: every school with an active SMS channel. Institution is the tenant root, so it is listed unscoped. */
export async function processAllQueues(now = new Date(), budgetMs = 45_000) {
  const ids = (await Institution.find({}).distinct("_id")) as unknown[];
  const totals = { schools: 0, sent: 0, retried: 0, failed: 0, delivered: 0, skipped: 0 };
  const startedAt = Date.now();
  for (const id of ids) {
    // Stay under the function timeout; skipped schools are picked up by the next run.
    if (Date.now() - startedAt > budgetMs) {
      totals.skipped += 1;
      continue;
    }
    const s = await processInstitutionQueue(id, { now });
    totals.schools += 1;
    totals.sent += s.sent;
    totals.retried += s.retried;
    totals.failed += s.failed;
    totals.delivered += s.delivered;
  }
  return totals;
}

const maskPhone = (p: string) => (p.length > 8 ? `${p.slice(0, 6)}****${p.slice(-3)}` : p);

export async function listNotifications(actor: Actor, page = 1) {
  const { institutionId } = actor;
  const size = 25;
  const skip = (Math.max(1, Math.floor(page) || 1) - 1) * size;
  const [rows, total] = await Promise.all([
    NotificationJob.find({ institutionId }).sort({ createdAt: -1 }).skip(skip).limit(size).lean() as unknown as Promise<
      Array<{ _id: unknown; studentId?: unknown; to: string; status: string; attempts: number; lastError?: string; createdAt: Date; segments: number }>
    >,
    NotificationJob.countDocuments({ institutionId }),
  ]);
  // No populate(): join student names with a scoped query.
  const ids = [...new Set(rows.map((r) => String(r.studentId ?? "")).filter(Boolean))];
  const students = ids.length
    ? ((await Student.find({ institutionId, _id: { $in: ids } }).lean()) as unknown as Array<{ _id: unknown; firstName: string; lastName?: string }>)
    : [];
  const names = new Map(students.map((s) => [String(s._id), [s.firstName, s.lastName].filter(Boolean).join(" ")]));
  return {
    total,
    pageSize: size,
    rows: rows.map((r) => ({
      id: String(r._id),
      student: names.get(String(r.studentId)) ?? "—",
      to: maskPhone(r.to),
      status: r.status,
      attempts: r.attempts,
      segments: r.segments,
      error: r.lastError ?? "",
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
