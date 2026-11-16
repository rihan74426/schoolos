import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']);

export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  status: attendanceStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const attendanceSubmissionSchema = z.object({
  sectionId: z.string().min(1),
  date: z.string().date(),
  records: z.array(attendanceRecordSchema).min(1).max(500),
}).superRefine((value, context) => {
  const studentIds = value.records.map((record) => record.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: 'A student may appear only once in an attendance submission.' });
  }
});

export function summarizeAttendance(records) {
  return records.reduce((summary, record) => {
    summary[record.status] += 1;
    return summary;
  }, { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 });
}
