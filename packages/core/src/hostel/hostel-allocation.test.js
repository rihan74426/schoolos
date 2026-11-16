import { describe, expect, it } from 'vitest';
import { canAssignRoom, hostelRules } from './hostel-allocation.js';

describe('hostel room allocation rules', () => {
  it('uses a configurable separate-gender default and validates occupancy', () => {
    expect(hostelRules.genderPolicy).toBe('separate');
    expect(canAssignRoom('double', 1, { residentGender: 'female', roomGender: 'female' })).toBe(true);
    expect(canAssignRoom('double', 1, { residentGender: 'female', roomGender: 'male' })).toBe(false);
    expect(canAssignRoom('double', 2, { residentGender: 'female', roomGender: 'female' })).toBe(false);
    expect(canAssignRoom('unknown', 0, { residentGender: 'female', roomGender: 'female' })).toBe(false);
  });

  it('requires an approved request for mixed-by-request policy', () => {
    expect(canAssignRoom('triple', 0, { genderPolicy: 'mixed-by-request' })).toBe(false);
    expect(canAssignRoom('triple', 0, { genderPolicy: 'mixed-by-request', approvedMixedRequest: true })).toBe(true);
    expect(canAssignRoom('triple', 0, { genderPolicy: 'mixed' })).toBe(true);
  });
});
