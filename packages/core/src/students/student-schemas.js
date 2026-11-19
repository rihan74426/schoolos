import { z } from 'zod';
import { normalizeBdPhone } from '../staff/staff-profile.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) && v >= '1950-01-01' && d.getTime() <= Date.now();
}, 'Enter a real past date (YYYY-MM-DD)');

const phone = z.string().transform((v, ctx) => {
  const normalized = normalizeBdPhone(v);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladesh mobile number' });
  return normalized ?? v;
});

export const guardianInputSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone,
  relationship: z.string().trim().min(2).max(30).default('Guardian'),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  isPrimary: z.boolean().default(false),
});

export const studentInputSchema = z.object({
  studentNumber: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  dateOfBirth: isoDate.optional().or(z.literal('').transform(() => undefined)),
  guardian: guardianInputSchema.optional(),
});

export const enrollmentInputSchema = z.object({ studentId: objectId, sectionId: objectId });
export const guardianLinkInputSchema = z.object({ studentId: objectId, guardian: guardianInputSchema });

// ---- CSV import -------------------------------------------------------------

// Minimal RFC 4180 parser: quotes, escaped quotes, commas/newlines inside quotes, BOM, CRLF.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export const IMPORT_COLUMNS = ['studentNumber', 'firstName', 'lastName', 'dateOfBirth', 'guardianName', 'guardianPhone', 'guardianRelationship', 'guardianEmail'];
export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(',')}\n1001,Abdullah,Rahman,2014-03-15,Karim Rahman,01712345678,Father,\n1002,Fatima,Akter,2014-07-02,Rahima Akter,01812345678,Mother,rahima@example.com\n`;
export const MAX_IMPORT_ROWS = 500;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Pure. Returns { rows:[{line,data}], errors:[{line,message}], total, fatal? }. Only error-free rows are in `rows`.
export function validateStudentImport(csvRows, { maxRows = MAX_IMPORT_ROWS } = {}) {
  if (!csvRows.length) return { rows: [], errors: [], total: 0, fatal: 'The file is empty' };
  const header = csvRows[0].map(norm);
  const index = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, header.indexOf(norm(c))]));
  const missing = ['studentNumber', 'firstName', 'lastName'].filter((c) => index[c] < 0);
  if (missing.length) return { rows: [], errors: [], total: 0, fatal: `Missing column: ${missing.join(', ')}. Download the template.` };

  const body = csvRows.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter(({ cells }) => cells.some((c) => String(c).trim() !== ''));
  if (body.length > maxRows) return { rows: [], errors: [], total: body.length, fatal: `Too many rows (${body.length}). Import at most ${maxRows} at a time.` };

  const get = (cells, key) => (index[key] >= 0 ? String(cells[index[key]] ?? '').trim() : '');
  const rows = [];
  const errors = [];
  const seen = new Map();
  for (const { cells, line } of body) {
    const problems = [];
    const guardianFields = [get(cells, 'guardianName'), get(cells, 'guardianPhone'), get(cells, 'guardianRelationship'), get(cells, 'guardianEmail')];
    const hasGuardian = guardianFields.some(Boolean);
    const candidate = {
      studentNumber: get(cells, 'studentNumber'),
      firstName: get(cells, 'firstName'),
      lastName: get(cells, 'lastName'),
      dateOfBirth: get(cells, 'dateOfBirth'),
      ...(hasGuardian ? {
        guardian: {
          fullName: guardianFields[0],
          phone: guardianFields[1],
          relationship: guardianFields[2] || 'Guardian',
          email: guardianFields[3],
          isPrimary: true,
        },
      } : {}),
    };
    const parsed = studentInputSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.') || 'row'}: ${issue.message}`);
    }
    const number = candidate.studentNumber;
    if (number) {
      if (seen.has(number)) problems.push(`studentNumber: duplicate of line ${seen.get(number)}`);
      else seen.set(number, line);
    }
    if (problems.length) errors.push(...problems.map((message) => ({ line, message })));
    else rows.push({ line, data: parsed.data });
  }
  return { rows, errors, total: body.length };
}
