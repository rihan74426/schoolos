import { z } from 'zod';

// Bangladesh mobile: 01[3-9]XXXXXXXX, optionally prefixed +88 / 88. Returns +8801XXXXXXXXX or null.
export function normalizeBdPhone(input) {
  const digits = String(input ?? '').replace(/[\s-]/g, '');
  const match = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(digits);
  return match ? `+88${match[1]}` : null;
}

export const staffProfileInputSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().transform((v, ctx) => {
    const normalized = normalizeBdPhone(v);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladesh mobile number' });
    return normalized ?? v;
  }),
  designation: z.string().trim().max(80).optional().default(''),
  subjects: z.string().trim().max(200).optional().default(''),
});
