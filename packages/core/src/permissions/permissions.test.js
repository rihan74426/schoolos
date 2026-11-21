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

  it('has a vice principal with leadership powers who cannot become owner or admin', () => {
    expect(can('VICE_PRINCIPAL', 'attendance:any-section')).toBe(true);
    expect(can('VICE_PRINCIPAL', 'staff:invite')).toBe(true);
    expect(can('VICE_PRINCIPAL', 'policy:write')).toBe(false);
    expect(invitableRoles('VICE_PRINCIPAL')).toEqual(['ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTS']);
    expect(invitableRoles('PRINCIPAL')).toContain('VICE_PRINCIPAL');
    expect(invitableRoles('ADMIN')).not.toContain('ADMIN');
  });

  it('splits fee powers: leaders configure, accounts records, coordinators may remit but not configure', () => {
    for (const role of ['OWNER', 'ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL']) {
      expect(can(role, 'fees:configure')).toBe(true);
      expect(can(role, 'fees:waive')).toBe(true);
      expect(can(role, 'fees:write')).toBe(true);
    }
    expect(can('ACADEMIC_COORDINATOR', 'fees:waive')).toBe(true);
    expect(can('ACADEMIC_COORDINATOR', 'fees:configure')).toBe(false);
    expect(can('ACADEMIC_COORDINATOR', 'fees:write')).toBe(false);
    expect(can('ACADEMIC_COORDINATOR', 'fees:read')).toBe(true);
    expect(can('ACCOUNTS', 'fees:write')).toBe(true);
    expect(can('ACCOUNTS', 'fees:waive')).toBe(false);
    expect(can('ACCOUNTS', 'fees:configure')).toBe(false);
    for (const role of ['TEACHER', 'GUARDIAN', 'STUDENT']) expect(can(role, 'fees:read')).toBe(false);
  });
});
