import { describe, expect, it } from 'vitest';
import { IMPORT_TEMPLATE, guardianInputSchema, parseCsv, studentInputSchema, validateStudentImport } from './student-schemas.js';

describe('csv parsing', () => {
  it('handles quotes, commas, newlines, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x,1","he said ""hi"""\r\n"multi\nline",z')).toEqual([['a', 'b'], ['x,1', 'he said "hi"'], ['multi\nline', 'z']]);
  });
});

describe('student schemas', () => {
  it('normalizes guardian phone and rejects bad dates', () => {
    const ok = studentInputSchema.safeParse({ studentNumber: '1', firstName: 'A', lastName: 'B', dateOfBirth: '2014-03-15', guardian: { fullName: 'Karim', phone: '01712-345678' } });
    expect(ok.success && ok.data.guardian.phone).toBe('+8801712345678');
    expect(studentInputSchema.safeParse({ studentNumber: '1', firstName: 'A', lastName: 'B', dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(studentInputSchema.safeParse({ studentNumber: '1', firstName: 'A', lastName: 'B', dateOfBirth: '2014-02-30' }).success).toBe(false);
    expect(guardianInputSchema.safeParse({ fullName: 'Karim', phone: 'abc' }).success).toBe(false);
  });
});

describe('student import validation', () => {
  it('accepts the template as-is', () => {
    const r = validateStudentImport(parseCsv(IMPORT_TEMPLATE));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].data.guardian.phone).toBe('+8801812345678');
  });
  it('reports per-row errors and keeps only valid rows', () => {
    const csv = 'studentNumber,firstName,lastName,dateOfBirth,guardianName,guardianPhone\n1,A,B,2014-01-01,Karim,01712345678\n2,,Z,2014-01-01,,\n1,D,E,,,\n4,F,G,not-a-date,,\n5,H,I,,Rahim,123';
    const r = validateStudentImport(parseCsv(csv));
    expect(r.total).toBe(5);
    expect(r.rows.map((x) => x.data.studentNumber)).toEqual(['1']);
    const lines = r.errors.map((e) => e.line);
    expect(lines).toEqual(expect.arrayContaining([3, 4, 5, 6]));
    expect(r.errors.find((e) => e.line === 4).message).toMatch(/duplicate of line 2/);
  });
  it('fails fast on missing columns and oversized files', () => {
    expect(validateStudentImport(parseCsv('foo,bar\n1,2')).fatal).toMatch(/Missing column/);
    expect(validateStudentImport([]).fatal).toMatch(/empty/);
    const big = 'studentNumber,firstName,lastName\n' + Array.from({ length: 6 }, (_, i) => `${i},A,B`).join('\n');
    expect(validateStudentImport(parseCsv(big), { maxRows: 5 }).fatal).toMatch(/Too many rows/);
  });
  it('allows a single-name student (no lastName)', () => {
    expect(studentInputSchema.safeParse({ studentNumber: '9', firstName: 'Abdullah' }).success).toBe(true);
    const r = validateStudentImport(parseCsv('studentNumber,firstName\n9,Abdullah'));
    expect(r.errors).toEqual([]);
    expect(r.rows[0].data.lastName).toBe('');
  });
  it('ignores blank lines and accepts loose header names', () => {
    const r = validateStudentImport(parseCsv('Student Number,First_Name,LAST NAME\n\n7,A,B\n'));
    expect(r.rows).toHaveLength(1);
  });
});
