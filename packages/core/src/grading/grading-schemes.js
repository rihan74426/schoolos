import { z } from 'zod';

// A grading scheme is data, not code: each institution picks a preset at setup
// or defines its own bands. Presets are TEMPLATES the founder must confirm.
export const gradeBandSchema = z.object({
  label: z.string().trim().min(1).max(20),
  minPercent: z.number().min(0).max(100),
  gradePoint: z.number().min(0).max(100).optional(),
  remark: z.string().trim().max(60).optional(),
});

export const gradingSchemeSchema = z.object({
  key: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['LETTER', 'GPA', 'DIVISION', 'PASS_FAIL', 'CUSTOM']).default('CUSTOM'),
  passPercent: z.number().min(0).max(100),
  failLabel: z.string().trim().min(1).max(20).default('F'),
  bands: z.array(gradeBandSchema).min(1).max(20),
}).superRefine((scheme, ctx) => {
  const mins = scheme.bands.map((b) => b.minPercent);
  if (new Set(mins).size !== mins.length) {
    ctx.addIssue({ code: 'custom', path: ['bands'], message: 'band minPercent values must be unique' });
  }
  if (new Set(scheme.bands.map((b) => b.label)).size !== scheme.bands.length) {
    ctx.addIssue({ code: 'custom', path: ['bands'], message: 'band labels must be unique' });
  }
});

export const gradingPresets = {
  'letter-basic': {
    key: 'letter-basic', name: 'Letter grades (A–D)', kind: 'LETTER', passPercent: 40, failLabel: 'F',
    bands: [
      { label: 'A', minPercent: 80 }, { label: 'B', minPercent: 65 },
      { label: 'C', minPercent: 50 }, { label: 'D', minPercent: 40 },
    ],
  },
  'gpa-5': {
    key: 'gpa-5', name: 'GPA 5.0 scale', kind: 'GPA', passPercent: 33, failLabel: 'F',
    bands: [
      { label: 'A+', minPercent: 80, gradePoint: 5 }, { label: 'A', minPercent: 70, gradePoint: 4 },
      { label: 'A-', minPercent: 60, gradePoint: 3.5 }, { label: 'B', minPercent: 50, gradePoint: 3 },
      { label: 'C', minPercent: 40, gradePoint: 2 }, { label: 'D', minPercent: 33, gradePoint: 1 },
    ],
  },
  division: {
    key: 'division', name: 'Divisions', kind: 'DIVISION', passPercent: 33, failLabel: 'Fail',
    bands: [
      { label: 'First', minPercent: 60 }, { label: 'Second', minPercent: 45 }, { label: 'Third', minPercent: 33 },
    ],
  },
  'pass-fail': {
    key: 'pass-fail', name: 'Pass / Fail (e.g. Hifz, Qaida)', kind: 'PASS_FAIL', passPercent: 50, failLabel: 'Fail',
    bands: [{ label: 'Pass', minPercent: 50 }],
  },
};

export function validateGradingScheme(input) {
  return gradingSchemeSchema.parse(input);
}

export function percentOf(marks, maxMarks) {
  if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0) {
    throw new RangeError('maxMarks must be positive and marks must be finite');
  }
  if (marks < 0 || marks > maxMarks) throw new RangeError('marks must be between 0 and maxMarks');
  return (marks / maxMarks) * 100;
}

// Returns { label, gradePoint?, remark?, passed }. Fails below passPercent even if a band would match.
export function gradeFor(percent, scheme) {
  const s = validateGradingScheme(scheme);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError('percent must be between 0 and 100');
  }
  if (percent < s.passPercent) return { label: s.failLabel, gradePoint: 0, passed: false };
  const band = [...s.bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent);
  if (!band) return { label: s.failLabel, gradePoint: 0, passed: false };
  return { label: band.label, gradePoint: band.gradePoint, remark: band.remark, passed: true };
}

export function gradeMarks(marks, maxMarks, scheme) {
  return gradeFor(percentOf(marks, maxMarks), scheme);
}
