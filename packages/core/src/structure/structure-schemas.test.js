import { describe, expect, it } from 'vitest';
import { academicYearInputSchema, parseBandLines, sectionInputSchema } from './structure-schemas.js';

describe('structure schemas', () => {
  it('validates academic year dates', () => {
    expect(academicYearInputSchema.safeParse({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' }).success).toBe(true);
    expect(academicYearInputSchema.safeParse({ name: '2026', startsOn: '2026-12-31', endsOn: '2026-01-01' }).success).toBe(false);
    expect(academicYearInputSchema.safeParse({ name: 'x', startsOn: '2026-02-30', endsOn: '2026-12-31' }).success).toBe(false);
  });
  it('requires real object ids', () => {
    expect(sectionInputSchema.safeParse({ academicYearId: 'abcdefghijkl', gradeLevelId: 'a'.repeat(24), name: 'A' }).success).toBe(false);
  });
  it('parses band lines', () => {
    expect(parseBandLines('A+ 80 5\nA 70 4\n\nPass 40')).toEqual({ bands: [{ label: 'A+', minPercent: 80, gradePoint: 5 }, { label: 'A', minPercent: 70, gradePoint: 4 }, { label: 'Pass', minPercent: 40 }] });
    expect(parseBandLines('A')).toHaveProperty('error');
    expect(parseBandLines('A x')).toHaveProperty('error');
    expect(parseBandLines('')).toHaveProperty('error');
  });
});
