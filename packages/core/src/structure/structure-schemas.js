import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}, 'Not a real calendar date');

export const academicYearInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  startsOn: isoDate,
  endsOn: isoDate,
  makeCurrent: z.boolean().default(false),
}).refine((y) => y.endsOn > y.startsOn, { path: ['endsOn'], message: 'endsOn must be after startsOn' });

export const gradeLevelInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const sectionInputSchema = z.object({
  academicYearId: objectId,
  gradeLevelId: objectId,
  name: z.string().trim().min(1).max(40),
});

export const teachingAssignmentInputSchema = z.object({
  membershipId: objectId,
  sectionId: objectId,
});

// "A+ 80 5" / "Pass 50" lines -> bands. Returns { bands } or { error }.
export function parseBandLines(text) {
  const bands = [];
  for (const [i, raw] of String(text ?? '').split('\n').entries()) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const gradePoint = parts.length > 2 ? Number(parts[2]) : undefined;
    const minPercent = Number(parts[1]);
    if (parts.length < 2 || parts.length > 3 || !Number.isFinite(minPercent) || (parts.length === 3 && !Number.isFinite(gradePoint))) {
      return { error: `Line ${i + 1}: use "label minPercent [gradePoint]"` };
    }
    bands.push({ label: parts[0], minPercent, ...(gradePoint === undefined ? {} : { gradePoint }) });
  }
  return bands.length ? { bands } : { error: 'Add at least one band' };
}
