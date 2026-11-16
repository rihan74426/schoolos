import { describe, expect, it } from 'vitest';
import { buildAcademicCalendar } from './term-calendar.js';

describe('academic calendar', () => {
  it('uses inclusive date-only UTC ranges', () => {
    expect(buildAcademicCalendar('2024-02-28', 2)).toEqual({
      startDate: '2024-02-28',
      endDate: '2024-02-29',
      durationDays: 2,
    });
  });

  it('rejects invalid dates and durations', () => {
    expect(() => buildAcademicCalendar('2026-02-30', 4)).toThrow();
    expect(() => buildAcademicCalendar('2026-02-01', 0)).toThrow(RangeError);
  });
});
