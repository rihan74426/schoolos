import { describe, expect, it } from 'vitest';
import { scoreRankEntry } from './ranking-policy.js';

describe('ranking score', () => {
  it('combines configured metrics using the current policy', () => {
    expect(scoreRankEntry({ academic: 100, attendance: 80, conduct: 90 })).toBe(94);
  });
});
