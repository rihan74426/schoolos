import { z } from 'zod';
import { gradingPresets } from '../grading/grading-schemes.js';

const pct = z.number().min(0).max(100);
const minor = z.number().int().min(0);

export const feePolicySchema = z.object({
  currency: z.string().length(3).default('BDT'),
  lateFee: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('NONE') }),
    z.object({ mode: z.literal('FLAT'), flatMinor: minor, graceDays: z.number().int().min(0).default(0) }),
    z.object({
      mode: z.literal('PERCENT_PER_DAY'), percent: z.number().min(0).max(100),
      graceDays: z.number().int().min(0).default(0), capPercent: pct.default(100),
    }),
  ]),
  scholarshipCapPercent: pct,
});

export const institutionPolicySchema = z.object({
  attendance: z.object({
    minimumAttendancePercent: pct,
    flagBelowPercent: pct,
    maxExcusedAbsenceDays: z.number().int().min(0).max(366),
    correctionRequiresReason: z.boolean().default(true),
    // Teachers may correct their own section only inside this window; coordinators+ any time.
    correctionWindowHours: z.number().int().min(0).max(8760).default(48),
    // Every active student in the section must be marked before submit.
    requireFullRoster: z.boolean().default(true),
  }),
  fees: feePolicySchema,
  hostel: z.object({
    enabled: z.boolean(),
    genderPolicy: z.enum(['separate', 'mixed', 'mixed-by-request']),
    roomCapacities: z.record(z.string().min(1).max(30), z.number().int().min(1).max(50)),
  }),
  ranking: z.object({
    enabled: z.boolean(),
    weights: z.record(z.enum(['grade', 'attendance', 'conduct', 'discipline']), z.number().min(0)),
  }),
  calendar: z.object({
    termsPerYear: z.number().int().min(1).max(6),
    weekendDays: z.array(z.number().int().min(0).max(6)).max(6), // 0=Sun … 6=Sat
  }),
  gradingSchemeKey: z.string().min(1).max(40),
});

// Starting templates offered at institution creation. Founder reviews/edits every value.
export const policyPresets = {
  'bd-school': {
    attendance: { minimumAttendancePercent: 75, flagBelowPercent: 80, maxExcusedAbsenceDays: 10, correctionRequiresReason: true, correctionWindowHours: 48, requireFullRoster: true },
    fees: { currency: 'BDT', lateFee: { mode: 'NONE' }, scholarshipCapPercent: 50 },
    hostel: { enabled: false, genderPolicy: 'separate', roomCapacities: { single: 1, double: 2, triple: 3 } },
    ranking: { enabled: false, weights: { grade: 70, attendance: 30 } },
    calendar: { termsPerYear: 3, weekendDays: [5, 6] },
    gradingSchemeKey: 'gpa-5',
  },
  'bd-madrasa': {
    attendance: { minimumAttendancePercent: 75, flagBelowPercent: 80, maxExcusedAbsenceDays: 10, correctionRequiresReason: true, correctionWindowHours: 48, requireFullRoster: true },
    fees: { currency: 'BDT', lateFee: { mode: 'NONE' }, scholarshipCapPercent: 50 },
    hostel: { enabled: true, genderPolicy: 'separate', roomCapacities: { single: 1, double: 2, triple: 3 } },
    ranking: { enabled: false, weights: { grade: 60, attendance: 20, conduct: 20 } },
    calendar: { termsPerYear: 3, weekendDays: [5] },
    gradingSchemeKey: 'division',
  },
};

export function buildInitialPolicy(presetKey = 'bd-school', overrides = {}) {
  const base = policyPresets[presetKey];
  if (!base) throw new RangeError(`Unknown policy preset: ${presetKey}`);
  const merged = { ...structuredClone(base), ...overrides };
  const policy = institutionPolicySchema.parse(merged);
  if (!Object.hasOwn(gradingPresets, policy.gradingSchemeKey) && !overrides.gradingSchemeKey) {
    throw new RangeError('gradingSchemeKey must reference a known scheme');
  }
  return policy;
}

export function lateFeeFromPolicy(amountMinor, lateDays, lateFeePolicy) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new TypeError('amountMinor must be a non-negative safe integer');
  if (!Number.isSafeInteger(lateDays) || lateDays < 0) throw new TypeError('lateDays must be a non-negative safe integer');
  if (lateFeePolicy.mode === 'NONE') return 0;
  const days = Math.max(0, lateDays - (lateFeePolicy.graceDays ?? 0));
  if (days === 0) return 0;
  if (lateFeePolicy.mode === 'FLAT') return lateFeePolicy.flatMinor;
  const pctApplied = Math.min(lateFeePolicy.percent * days, lateFeePolicy.capPercent ?? 100);
  return Math.round((amountMinor * pctApplied) / 100);
}

export function attendanceStanding(percent, attendancePolicy) {
  if (percent < attendancePolicy.minimumAttendancePercent) return 'INELIGIBLE';
  if (percent < attendancePolicy.flagBelowPercent) return 'AT_RISK';
  return 'OK';
}
