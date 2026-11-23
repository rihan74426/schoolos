import { describe, expect, it } from 'vitest';
import { canExamTransition, computeResult, examStatusFromSheets, gradingPresets, markError, saveMarksSchema, subjectInputSchema } from '../index.js';

const gpa = gradingPresets['gpa-5']; // pass 33%
const sub = (name, marks, extra = {}) => ({ subjectId: name, name, maxMarks: 100, isCore: false, status: 'PRESENT', marks, ...extra });

describe('exam status flow', () => {
  it('moves forward one step and never leaves PUBLISHED', () => {
    expect(canExamTransition('DRAFT', 'ENTRY')).toBe(true);
    expect(canExamTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canExamTransition('APPROVED', 'PUBLISHED')).toBe(true);
    expect(canExamTransition('SUBMITTED', 'ENTRY')).toBe(true);
    for (const s of ['DRAFT', 'ENTRY', 'SUBMITTED', 'APPROVED']) expect(canExamTransition('PUBLISHED', s)).toBe(false);
  });
  it('derives exam status from sheets', () => {
    expect(examStatusFromSheets([])).toBe('ENTRY');
    expect(examStatusFromSheets(['SUBMITTED', 'ENTRY'])).toBe('ENTRY');
    expect(examStatusFromSheets(['SUBMITTED', 'APPROVED'])).toBe('SUBMITTED');
    expect(examStatusFromSheets(['APPROVED', 'APPROVED'])).toBe('APPROVED');
  });
});

describe('markError', () => {
  it('accepts 0..max with up to 2 decimals', () => {
    expect(markError(0, 100)).toBeNull();
    expect(markError(100, 100)).toBeNull();
    expect(markError(72.25, 100)).toBeNull();
  });
  it('rejects negative, above max, too many decimals and non-numbers', () => {
    expect(markError(-1, 100)).toMatch(/negative/);
    expect(markError(100.5, 100)).toMatch(/more than 100/);
    expect(markError(7.255, 100)).toMatch(/decimal/);
    expect(markError(Number.NaN, 100)).toMatch(/number/);
    expect(markError('80', 100)).toMatch(/number/);
  });
});

describe('computeResult', () => {
  it('grades subjects, totals and GPA', () => {
    const r = computeResult([sub('Math', 85), sub('Bangla', 72)], gpa);
    expect(r).toMatchObject({ totalMarks: 157, totalMax: 200, percent: 78.5, passed: true, grade: 'A', failedSubjects: [] });
    expect(r.subjects.map((s) => s.grade)).toEqual(['A+', 'A']);
    expect(r.gpa).toBe(4.5);
  });
  it('fails the exam when any subject fails (default rule), GPA 0', () => {
    const r = computeResult([sub('Math', 95), sub('Science', 30)], gpa);
    expect(r).toMatchObject({ passed: false, failedSubjects: ['Science'], grade: 'F', gpa: 0 });
  });
  it('absent counts as 0 and failed; exempt is left out', () => {
    const r = computeResult([sub('Math', 90), sub('Art', undefined, { status: 'ABSENT' })], gpa);
    expect(r).toMatchObject({ totalMarks: 90, totalMax: 200, passed: false, failedSubjects: ['Art'] });
    const e = computeResult([sub('Math', 90), sub('Art', undefined, { status: 'EXEMPT' })], gpa);
    expect(e).toMatchObject({ totalMarks: 90, totalMax: 100, percent: 90, passed: true });
    expect(e.subjects[1]).toMatchObject({ grade: null, passed: null });
  });
  it('CORE_ONLY ignores a failed non-core subject but not a failed core one', () => {
    const rules = { passRule: 'CORE_ONLY' };
    expect(computeResult([sub('Quran', 80, { isCore: true }), sub('Art', 10)], gpa, rules)).toMatchObject({ passed: true, failedSubjects: ['Art'] });
    expect(computeResult([sub('Quran', 20, { isCore: true }), sub('Art', 90)], gpa, rules)).toMatchObject({ passed: false });
  });
  it('CORE_ONLY with no core subject falls back to all subjects', () => {
    expect(computeResult([sub('Math', 90), sub('Art', 10)], gpa, { passRule: 'CORE_ONLY' })).toMatchObject({ passed: false });
  });
  it('an exam controller override passes the student and is flagged with the reason', () => {
    const r = computeResult([sub('Math', 90), sub('Science', 30)], gpa, { override: { reason: 'Illness during exam week' } });
    expect(r).toMatchObject({ passed: true, overridden: true, overrideReason: 'Illness during exam week', failedSubjects: ['Science'] });
    expect(computeResult([sub('Math', 90)], gpa, { override: { reason: 'not needed here' } }).overridden).toBe(false);
  });
  it('works with a pass/fail scheme (no grade points)', () => {
    const pf = gradingPresets['pass-fail'];
    expect(computeResult([sub('Hifz', 60)], pf)).toMatchObject({ passed: true, grade: 'Pass', gpa: null });
    expect(computeResult([sub('Hifz', 40)], pf)).toMatchObject({ passed: false, grade: 'Fail' });
  });
  it('rejects bad input instead of guessing', () => {
    expect(() => computeResult([], gpa)).toThrow(/at least one/);
    expect(() => computeResult([sub('Math', 101)], gpa)).toThrow(/more than 100/);
    expect(() => computeResult([sub('Math', undefined)], gpa)).toThrow(/number/);
    expect(() => computeResult([sub('Art', undefined, { status: 'EXEMPT' })], gpa)).toThrow(/exempt/);
    expect(() => computeResult([sub('Math', 50)], gpa, { passRule: 'ANY' })).toThrow(/pass rule/);
  });
  it('is pure: scheme edits later do not alter an existing result object', () => {
    const scheme = structuredClone(gpa);
    const r = computeResult([sub('Math', 85)], scheme);
    scheme.passPercent = 99;
    expect(r.passed).toBe(true);
  });
});

describe('input schemas', () => {
  const id = 'a'.repeat(24);
  it('mark entries and subjects validate', () => {
    expect(saveMarksSchema.safeParse({ assessmentId: id, entries: [{ studentId: id, status: 'PRESENT', marks: 5 }] }).success).toBe(true);
    expect(saveMarksSchema.safeParse({ assessmentId: id, entries: [{ studentId: id, status: 'LATE' }] }).success).toBe(false);
    expect(subjectInputSchema.safeParse({ code: 'MATH', name: 'Mathematics', isCore: true }).success).toBe(true);
    expect(subjectInputSchema.safeParse({ code: 'bad code', name: 'x' }).success).toBe(false);
  });
});
