import { describe, expect, it } from 'vitest';
import { computeGrade } from './grade-policy.js';
import { isAttendanceEligible } from '../attendance/attendance-rules.js';
import { calculateLateFee } from '../fees/fee-waiver-rules.js';

describe('core rules', () => {
  it('uses the configured grade bands and pass mark', () => {
    expect(computeGrade(82)).toBe('A');
    expect(computeGrade(70, 40, { a: 90, b: 70, c: 55, d: 40 })).toBe('B');
    expect(computeGrade(45)).toBe('D');
    expect(computeGrade(39)).toBe('F');
  });

  it('rejects invalid marks and invalid grade bands', () => {
    expect(() => computeGrade(Number.NaN)).toThrow(RangeError);
    expect(() => computeGrade(-1)).toThrow(RangeError);
    expect(() => computeGrade(101)).toThrow(RangeError);
    expect(() => computeGrade(70, 40, { a: 50, b: 70, c: 40 })).toThrow(RangeError);
  });

  it('evaluates attendance eligibility', () => {
    expect(isAttendanceEligible(80)).toBe(true);
    expect(isAttendanceEligible(70)).toBe(false);
  });

  it('calculates fees in integer minor units', () => {
    expect(calculateLateFee(1000, 2)).toBe(100);
    expect(calculateLateFee(101, 1)).toBe(5);
    expect(calculateLateFee(1000, 0)).toBe(0);
    expect(() => calculateLateFee(10.5, 1)).toThrow(TypeError);
  });
});
