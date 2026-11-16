import { describe, expect, it } from 'vitest';
import { computeGrade } from './grading/grade-policy.js';
import { isAttendanceEligible } from './attendance/attendance-rules.js';
import { calculateLateFee } from './fees/fee-waiver-rules.js';

describe('core rules', () => {
  it('grades a pass mark correctly', () => {
    expect(computeGrade(82)).toBe('A');
    expect(computeGrade(45)).toBe('D');
  });

  it('evaluates attendance eligibility', () => {
    expect(isAttendanceEligible(80)).toBe(true);
    expect(isAttendanceEligible(70)).toBe(false);
  });

  it('calculates late fee correctly', () => {
    expect(calculateLateFee(1000, 2)).toBe(100);
  });
});
