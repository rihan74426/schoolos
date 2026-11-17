import { isObjectIdOrHexString as isValidObjectId } from "mongoose";
import { attendanceSubmissionSchema } from "@schoolos/core";
import { AttendanceSession, AuditEvent, Section, Student } from "@schoolos/db";

export async function submitAttendance(
  input: unknown,
  actor: { membershipId: unknown; institutionId: unknown },
) {
  const parsed = attendanceSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid attendance data",
      issues: parsed.error.issues,
    };
  }

  const { sectionId, date, records, correctionReason } = parsed.data;
  const institutionId = actor.institutionId;
  if (!isValidObjectId(sectionId)) {
    return { ok: false as const, error: "Invalid sectionId" };
  }

  const section = await Section.findOne({
    _id: sectionId,
    institutionId,
    status: "ACTIVE",
  }).lean();
  if (!section) {
    return { ok: false as const, error: "Section not found" };
  }

  const invalidStudentId = records.find(
    (record) => !isValidObjectId(record.studentId),
  );
  if (invalidStudentId) {
    return {
      ok: false as const,
      error: `Invalid studentId: ${invalidStudentId.studentId}`,
    };
  }

  const studentIds = records.map((record) => record.studentId);
  const students = await Student.find({
    _id: { $in: studentIds },
    institutionId,
    sectionId,
    status: "ACTIVE",
  })
    .select("_id")
    .lean();
  if (students.length !== studentIds.length) {
    return {
      ok: false as const,
      error: "One or more students are not active members of this section",
    };
  }

  const entries = records.map(({ studentId, status, note }) => ({
    studentId,
    status,
    ...(note ? { note } : {}),
  }));
  const filter = { institutionId, sectionId, date };
  const existing = (await AttendanceSession.findOne(filter).lean()) as {
    _id: unknown;
    status: string;
    updatedAt: Date;
    entries: Array<{ studentId: unknown; status: string; note?: string }>;
  } | null;

  if (existing?.status === "ARCHIVED") {
    return {
      ok: false as const,
      error: "Archived attendance sessions cannot be changed",
    };
  }
  if (existing?.status === "ACTIVE" && !correctionReason) {
    return {
      ok: false as const,
      error: "A correction reason is required to change submitted attendance",
    };
  }

  const previousEntries = new Map(
    (existing?.entries ?? []).map((entry) => [String(entry.studentId), entry]),
  );
  const nextEntries = new Map(entries.map((entry) => [entry.studentId, entry]));
  const changedStudentIds = new Set([
    ...previousEntries.keys(),
    ...nextEntries.keys(),
  ]);
  const changes = [...changedStudentIds].flatMap((studentId) => {
    const before = previousEntries.get(studentId);
    const after = nextEntries.get(studentId);
    if (before?.status === after?.status && before?.note === after?.note)
      return [];
    return [
      {
        studentId,
        before: before ? { status: before.status, note: before.note } : null,
        after: after ? { status: after.status, note: after.note } : null,
      },
    ];
  });
  const isCorrection = existing?.status === "ACTIVE";
  if (isCorrection && changes.length === 0) {
    return {
      ok: false as const,
      error: "The submitted attendance is unchanged",
    };
  }

  const update = {
    $set: {
      entries,
      recordedByMembershipId: actor.membershipId,
      status: "ACTIVE",
      submittedAt: new Date(),
    },
    $setOnInsert: { institutionId, sectionId, date },
  };
  const session = existing
    ? await AttendanceSession.findOneAndUpdate(
        { _id: existing._id, institutionId, updatedAt: existing.updatedAt },
        update,
        { new: true, runValidators: true },
      )
    : await AttendanceSession.findOneAndUpdate(
        { ...filter, status: { $ne: "ACTIVE" } },
        update,
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      ).catch((error: { code?: number }) => {
        if (error.code === 11000) return null;
        throw error;
      });

  if (!session) {
    return {
      ok: false as const,
      error: "Attendance changed concurrently. Reload and retry.",
    };
  }

  await AuditEvent.create({
    institutionId,
    actorMembershipId: actor.membershipId,
    action: isCorrection ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_SUBMITTED",
    entityType: "AttendanceSession",
    entityId: session._id.toString(),
    metadata: {
      sectionId,
      date,
      recordCount: records.length,
      correction: isCorrection,
      ...(isCorrection ? { reason: correctionReason, changes } : {}),
    },
  });

  return {
    ok: true as const,
    sessionId: session._id.toString(),
    submittedAt: session.submittedAt?.toISOString(),
  };
}
