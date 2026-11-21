import { describe, expect, it } from 'vitest';
import { feePolicySchema, formatMinor, takaToMinor } from '../index.js';

describe('money helpers', () => {
  it('parses taka into integer paisa without float drift', () => {
    expect(takaToMinor('1250')).toBe(125000);
    expect(takaToMinor('1250.5')).toBe(125050);
    expect(takaToMinor('0.29')).toBe(29);
    expect(takaToMinor(' 19.99 ')).toBe(1999);
  });
  it('rejects negatives, 3 decimals, text and empties', () => {
    for (const bad of ['-5', '1.234', 'abc', '', '1e3', '1,000', null, undefined]) expect(takaToMinor(bad)).toBeNull();
  });
  it('formats with grouping', () => {
    expect(formatMinor(123456789)).toBe('BDT 1,234,567.89');
    expect(formatMinor(5)).toBe('BDT 0.05');
    expect(formatMinor(-1050)).toBe('-BDT 10.50');
    expect(() => formatMinor(1.5)).toThrow(TypeError);
  });
});

describe('feePolicySchema', () => {
  it('defaults to a valid no-late-fee rule shape and validates modes', () => {
    expect(feePolicySchema.safeParse({ currency: 'BDT', lateFee: { mode: 'NONE' }, scholarshipCapPercent: 50 }).success).toBe(true);
    expect(feePolicySchema.safeParse({ currency: 'BDT', lateFee: { mode: 'FLAT', flatMinor: 10000 }, scholarshipCapPercent: 0 }).success).toBe(true);
    expect(feePolicySchema.safeParse({ currency: 'BDT', lateFee: { mode: 'PERCENT_PER_DAY', percent: 101 }, scholarshipCapPercent: 0 }).success).toBe(false);
    expect(feePolicySchema.safeParse({ currency: 'BDT', lateFee: { mode: 'FLAT', flatMinor: -1 }, scholarshipCapPercent: 0 }).success).toBe(false);
    expect(feePolicySchema.safeParse({ currency: 'BDT', lateFee: { mode: 'WEIRD' }, scholarshipCapPercent: 0 }).success).toBe(false);
  });
});
