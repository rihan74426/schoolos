import { describe, expect, it } from 'vitest';
import { can, invitableRoles, rolesFor } from './permissions.js';

describe('permissions', () => {
  it('grants by role and denies unknown actions/roles', () => {
    expect(can('TEACHER', 'attendance:submit')).toBe(true);
    expect(can('TEACHER', 'attendance:any-section')).toBe(false);
    expect(can('GUARDIAN', 'student:write')).toBe(false);
    expect(can('OWNER', 'nope')).toBe(false);
    expect(can('constructor', 'policy:read')).toBe(false);
    expect(can('OWNER', 'constructor')).toBe(false);
  });
  it('lists roles and rejects unknown action', () => {
    expect(rolesFor('policy:write')).toEqual(['OWNER', 'ADMIN']);
    expect(() => rolesFor('nope')).toThrow(RangeError);
  });

  it('limits who can be invited by whom', () => {
    expect(invitableRoles('ACADEMIC_COORDINATOR')).toEqual(['TEACHER']);
    expect(invitableRoles('PRINCIPAL')).not.toContain('ADMIN');
    expect(invitableRoles('OWNER')).not.toContain('OWNER');
    expect(invitableRoles('TEACHER')).toEqual([]);
    expect(invitableRoles('constructor')).toEqual([]);
  });
});
