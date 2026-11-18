import { describe, expect, it } from 'vitest';
import { setupProgress } from './setup-progress.js';

describe('setupProgress', () => {
  it('starts at 0 of 4 and points at the first step', () => {
    const p = setupProgress({});
    expect(p).toMatchObject({ completed: 0, total: 4 });
    expect(p.next?.key).toBe('academic-year');
  });
  it('needs both a class and a section for the structure step', () => {
    expect(setupProgress({ currentYears: 1, gradeLevels: 2 }).steps[1].done).toBe(false);
    const p = setupProgress({ currentYears: 1, gradeLevels: 2, sections: 1 });
    expect(p.completed).toBe(2);
    expect(p.next?.key).toBe('students');
  });
  it('is complete with no next step', () => {
    expect(setupProgress({ currentYears: 1, gradeLevels: 1, sections: 1, students: 1, attendanceSessions: 1 }).next).toBeNull();
  });
});
