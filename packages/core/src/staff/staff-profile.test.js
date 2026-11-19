import { describe, expect, it } from 'vitest';
import { normalizeBdPhone, staffProfileInputSchema } from './staff-profile.js';

describe('staff profile', () => {
  it('normalizes Bangladesh mobiles', () => {
    expect(normalizeBdPhone('01712-345678')).toBe('+8801712345678');
    expect(normalizeBdPhone('+880 1712345678')).toBe('+8801712345678');
    expect(normalizeBdPhone('8801912345678')).toBe('+8801912345678');
    expect(normalizeBdPhone('01212345678')).toBeNull();
    expect(normalizeBdPhone('12345')).toBeNull();
    expect(normalizeBdPhone(undefined)).toBeNull();
  });
  it('validates the profile', () => {
    const ok = staffProfileInputSchema.safeParse({ fullName: ' Abdul Karim ', phone: '01712345678' });
    expect(ok.success && ok.data).toMatchObject({ fullName: 'Abdul Karim', phone: '+8801712345678', designation: '' });
    expect(staffProfileInputSchema.safeParse({ fullName: 'A', phone: '01712345678' }).success).toBe(false);
    expect(staffProfileInputSchema.safeParse({ fullName: 'Abdul', phone: 'abc' }).success).toBe(false);
  });
});
