import { attendanceSubmissionSchema } from '@schoolos/core';
import { AttendanceSession, AuditEvent, Membership, Section, Student } from '@schoolos/db';

export async function submitAttendance(input: unknown, actor: { membershipId: unknown; institutionId: unknown }) {
  const parsed = attendanceSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid attendance data', issues: parsed.error.issues };

  const { sectionId, date, records } = parsed.data;
  const institutionId = actor.institutionId;
  const section = await Section.findOne({ _id: sectionId, institutionId, status: 'ACTIVE' }).lean();
  if (!section) return { ok: false as const, error: 'Section not found' };

  const studentIds = records.map((record) => record.studentId);
  const students = await Student.find({ _id: { $in: studentIds }, institutionId, sectionId, status: 'ACTIVE' }).select('_id').lean();
  if (students.length !== studentIds.length) {
    return { ok: false as const, error: 'One or more students are not active members of this section' };
  }

  const entries = records.map(({ studentId, status, note }) => ({ studentId, status, ...(note ? { note } : {}) }));
  const session = await AttendanceSession.findOneAndUpdate(
    { institutionId, sectionId, date },
    {
      $set: { entries, recordedByMembershipId: actor.membershipId, status: 'ACTIVE', submittedAt: new Date() },
      $setOnInsert: { institutionId, sectionId, date },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  await AuditEvent.create({
    institutionId,
    actorMembershipId: actor.membershipId,
    action: 'ATTENDANCE_SUBMITTED',
    entityType: 'AttendanceSession',
    entityId: session._id.toString(),
    metadata: { sectionId, date, recordCount: records.length },
  });

  return { ok: true as const, sessionId: session._id.toString(), submittedAt: session.submittedAt?.toISOString() };
}
