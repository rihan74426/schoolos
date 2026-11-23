import { z } from 'zod';
import { gradeFor } from '../grading/grading-schemes.js';

// ---- Status flows ----
// Exam: DRAFT (setup) -> ENTRY (marks open) -> SUBMITTED (all sheets in) -> APPROVED -> PUBLISHED.
// ENTRY <- SUBMITTED/APPROVED when a sheet is sent back. PUBLISHED is final; later changes are versioned corrections.
export const EXAM_STATUSES = ['DRAFT', 'ENTRY', 'SUBMITTED', 'APPROVED', 'PUBLISHED'];
export const EXAM_TRANSITIONS = {
  DRAFT: ['ENTRY'],
  ENTRY: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'ENTRY'],
  APPROVED: ['PUBLISHED', 'ENTRY'],
  PUBLISHED: [],
};
export const canExamTransition = (from, to) => (EXAM_TRANSITIONS[from] ?? []).includes(to);

export const SHEET_STATUSES = ['ENTRY', 'SUBMITTED', 'APPROVED'];
export const ENTRY_STATUSES = ['PRESENT', 'ABSENT', 'EXEMPT'];
export const PASS_RULES = ['ALL_SUBJECTS', 'CORE_ONLY'];

/** Exam status implied by its sheets (before publish). Empty list stays in ENTRY. */
export function examStatusFromSheets(sheetStatuses) {
  if (!sheetStatuses.length || sheetStatuses.some((s) => s === 'ENTRY')) return 'ENTRY';
  return sheetStatuses.every((s) => s === 'APPROVED') ? 'APPROVED' : 'SUBMITTED';
}

// ---- Marks ----
const twoDecimals = (n) => Math.round(n * 100) / 100 === n;

/** Returns null when fine, else an error message. */
export function markError(marks, maxMarks) {
  if (typeof marks !== 'number' || !Number.isFinite(marks)) return 'Enter marks as a number';
  if (marks < 0) return 'Marks cannot be negative';
  if (marks > maxMarks) return `Marks cannot be more than ${maxMarks}`;
  if (!twoDecimals(marks)) return 'Use at most 2 decimal places';
  return null;
}

export const maxMarksSchema = z.number().min(1).max(1000).refine(twoDecimals, 'Use at most 2 decimal places');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Enter a real date');

export const examInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  term: z.string().trim().max(40).optional().default(''),
  academicYearId: objectId,
  gradeLevelId: objectId,
  passRule: z.enum(PASS_RULES).default('ALL_SUBJECTS'),
});

export const markEntrySchema = z.object({
  studentId: objectId,
  status: z.enum(ENTRY_STATUSES),
  marks: z.number().optional(),
});

export const saveMarksSchema = z.object({
  assessmentId: objectId,
  entries: z.array(markEntrySchema).max(500),
});

export const reasonSchema = z.string().trim().min(10, 'Give a reason of at least 10 characters').max(300);
export const sheetReturnSchema = z.object({ assessmentId: objectId, reason: reasonSchema });
export const passOverrideSchema = z.object({ examId: objectId, studentId: objectId, reason: reasonSchema, remove: z.boolean().optional().default(false) });
export const correctionRequestSchema = z.object({
  assessmentId: objectId, studentId: objectId, status: z.enum(ENTRY_STATUSES), marks: z.number().optional(), reason: reasonSchema,
});
export const assessmentUpdateSchema = z.object({ assessmentId: objectId, maxMarks: maxMarksSchema, date: isoDate.optional() });

export const subjectInputSchema = z.object({
  code: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9_-]+$/, 'Code: letters, numbers, - or _'),
  name: z.string().trim().min(1).max(60),
  isCore: z.boolean().default(false),
});
export const classSubjectInputSchema = z.object({ gradeLevelId: objectId, subjectId: objectId, defaultMaxMarks: maxMarksSchema.default(100) });

// ---- Result ----
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * One student's result for an exam.
 * subjects: [{ subjectId, name, maxMarks, isCore, status: PRESENT|ABSENT|EXEMPT, marks? }]
 * scheme: grading scheme (passPercent applies per subject and to the overall percent).
 * rules: { passRule: 'ALL_SUBJECTS' | 'CORE_ONLY', override?: { reason } }  (override = exam controller passes the student)
 * Absent = 0 marks and a failed subject. Exempt = left out of totals and the pass rule.
 * CORE_ONLY with no core subject falls back to ALL_SUBJECTS (never passes by accident).
 */
export function computeResult(subjects, scheme, rules = {}) {
  if (!Array.isArray(subjects) || !subjects.length) throw new RangeError('A result needs at least one subject');
  const passRule = rules.passRule ?? 'ALL_SUBJECTS';
  if (!PASS_RULES.includes(passRule)) throw new RangeError('Unknown pass rule');
  const rows = [];
  for (const s of subjects) {
    if (!ENTRY_STATUSES.includes(s.status)) throw new RangeError(`Subject ${s.name}: unknown status`);
    if (s.status === 'EXEMPT') { rows.push({ ...s, marks: null, percent: null, grade: null, gradePoint: null, passed: null }); continue; }
    const marks = s.status === 'ABSENT' ? 0 : s.marks;
    const err = markError(marks, s.maxMarks);
    if (err) throw new RangeError(`Subject ${s.name}: ${err}`);
    const percent = (marks / s.maxMarks) * 100;
    const g = s.status === 'ABSENT' ? { label: scheme.failLabel ?? 'F', gradePoint: 0, passed: false } : gradeFor(percent, scheme);
    rows.push({ ...s, marks, percent: round2(percent), grade: g.label, gradePoint: g.gradePoint ?? null, passed: g.passed });
  }
  const counted = rows.filter((r) => r.status !== 'EXEMPT');
  if (!counted.length) throw new RangeError('Every subject is exempt');
  const totalMarks = round2(counted.reduce((n, r) => n + r.marks, 0));
  const totalMax = counted.reduce((n, r) => n + r.maxMarks, 0);
  const percent = round2((totalMarks / totalMax) * 100);
  const hasCore = counted.some((r) => r.isCore);
  const decisive = passRule === 'CORE_ONLY' && hasCore ? counted.filter((r) => r.isCore) : counted;
  const failedSubjects = counted.filter((r) => !r.passed).map((r) => r.name);
  const rulePassed = decisive.every((r) => r.passed);
  const overridden = !rulePassed && Boolean(rules.override);
  const passed = rulePassed || overridden;
  const overall = gradeFor(percent, scheme);
  const withPoints = counted.every((r) => r.gradePoint != null);
  const gpa = withPoints ? round2(counted.reduce((n, r) => n + r.gradePoint, 0) / counted.length) : null;
  return {
    subjects: rows, totalMarks, totalMax, percent, passed, failedSubjects,
    overridden, overrideReason: overridden ? rules.override.reason ?? '' : undefined,
    grade: passed ? (overall.passed ? overall.label : scheme.bands.slice().sort((a, b) => a.minPercent - b.minPercent)[0].label) : (scheme.failLabel ?? 'F'),
    gpa: passed ? gpa : (gpa === null ? null : 0),
  };
}
