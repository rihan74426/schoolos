import { describe, expect, it } from 'vitest';
import { gradingPresets, gradeFor, gradeMarks, percentOf, validateGradingScheme } from './grading-schemes.js';
import { buildInitialPolicy, lateFeeFromPolicy, attendanceStanding } from '../policy/institution-policy.js';

describe('grading schemes', () => {
  it('supports multiple standards', () => {
    expect(gradeFor(85, gradingPresets['gpa-5'])).toMatchObject({ label: 'A+', gradePoint: 5, passed: true });
    expect(gradeFor(50, gradingPresets.division)).toMatchObject({ label: 'Second', passed: true });
    expect(gradeFor(32, gradingPresets['gpa-5'])).toMatchObject({ label: 'F', passed: false });
    expect(gradeFor(49, gradingPresets['pass-fail']).passed).toBe(false);
  });
  it('accepts a founder-defined custom scheme', () => {
    const custom = { key: 'x', name: 'Mine', passPercent: 20, bands: [{ label: 'Mumtaz', minPercent: 90 }, { label: 'Jayyid', minPercent: 60 }, { label: 'Maqbul', minPercent: 20 }] };
    expect(gradeFor(95, custom).label).toBe('Mumtaz');
    expect(gradeFor(25, custom).label).toBe('Maqbul');
  });
  it('uses per-subject max marks', () => {
    expect(percentOf(40, 50)).toBe(80);
    expect(gradeMarks(40, 50, gradingPresets['gpa-5']).label).toBe('A+');
    expect(() => percentOf(51, 50)).toThrow(RangeError);
  });
  it('rejects duplicate bands', () => {
    expect(() => validateGradingScheme({ key: 'k', name: 'n', passPercent: 40, bands: [{ label: 'A', minPercent: 50 }, { label: 'B', minPercent: 50 }] })).toThrow();
  });
});

describe('institution policy', () => {
  it('builds presets and validates overrides', () => {
    expect(buildInitialPolicy('bd-madrasa').hostel.enabled).toBe(true);
    expect(() => buildInitialPolicy('nope')).toThrow(RangeError);
    expect(() => buildInitialPolicy('bd-school', { fees: { currency: 'BDT', lateFee: { mode: 'FLAT', flatMinor: 1.5 }, scholarshipCapPercent: 10 } })).toThrow();
  });
  it('computes late fee per configured mode', () => {
    expect(lateFeeFromPolicy(1000, 3, { mode: 'NONE' })).toBe(0);
    expect(lateFeeFromPolicy(1000, 3, { mode: 'FLAT', flatMinor: 50, graceDays: 1 })).toBe(50);
    expect(lateFeeFromPolicy(1000, 2, { mode: 'FLAT', flatMinor: 50, graceDays: 2 })).toBe(0);
    expect(lateFeeFromPolicy(1000, 30, { mode: 'PERCENT_PER_DAY', percent: 5, graceDays: 0, capPercent: 20 })).toBe(200);
  });
  it('flags attendance standing', () => {
    const a = buildInitialPolicy().attendance;
    expect(attendanceStanding(70, a)).toBe('INELIGIBLE');
    expect(attendanceStanding(78, a)).toBe('AT_RISK');
    expect(attendanceStanding(90, a)).toBe('OK');
  });
});
