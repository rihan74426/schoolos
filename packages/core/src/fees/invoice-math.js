import { z } from 'zod';
import { lateFeeFromPolicy } from '../policy/institution-policy.js';
import { takaToMinor } from './money.js';

const DAY_MS = 86_400_000;
const dayNumber = (isoDate) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);

export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Enter a real date');

/** Whole days past the due date (0 on or before it). Both are YYYY-MM-DD school days. */
export function daysLate(dueDate, asOf) {
  return Math.max(0, dayNumber(asOf) - dayNumber(dueDate));
}

/**
 * Money picture of one invoice on a given day. All amounts are integer paisa.
 * Late fee accrues on the net principal per the school's policy until the invoice is settled,
 * after which `lateFeeFrozenMinor` (set at settlement) is used so it never grows again.
 */
export function invoiceSummary(invoice, lateFeePolicy, asOf) {
  const principal = Math.max(0, invoice.subtotalMinor - (invoice.discountMinor ?? 0));
  const frozen = invoice.lateFeeFrozenMinor;
  const lateFee = frozen != null ? frozen : lateFeeFromPolicy(principal, daysLate(invoice.dueDate, asOf), lateFeePolicy);
  const lateDue = Math.max(0, lateFee - (invoice.lateRemitMinor ?? 0));
  const total = principal + lateDue;
  const balance = Math.max(0, total - (invoice.paidMinor ?? 0));
  return {
    principalMinor: principal,
    lateFeeMinor: lateFee,
    lateDueMinor: lateDue,
    totalMinor: total,
    balanceMinor: balance,
    overdue: invoice.status === 'OPEN' && balance > 0 && asOf > invoice.dueDate,
  };
}

/** Largest extra discount allowed so total discounts stay within the school's scholarship cap. */
export function remainingDiscountMinor(subtotalMinor, discountMinor, capPercent) {
  const cap = Math.floor((subtotalMinor * capPercent) / 100);
  return Math.max(0, cap - discountMinor);
}

/** "Tuition: 1500" per line -> [{ title, amountMinor }]. Returns { lines } or { error }. */
export function parseFeeLines(text) {
  const rows = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return { error: 'Add at least one fee line' };
  if (rows.length > 30) return { error: 'At most 30 fee lines' };
  const lines = [];
  for (const row of rows) {
    const cut = row.lastIndexOf(':');
    const title = cut > 0 ? row.slice(0, cut).trim() : '';
    const amountMinor = cut > 0 ? takaToMinor(row.slice(cut + 1)) : null;
    if (!title || title.length > 60) return { error: `Use "Title: amount" on each line (problem: ${row.slice(0, 40)})` };
    if (amountMinor === null || amountMinor <= 0) return { error: `Amount must be a positive number of taka (problem: ${row.slice(0, 40)})` };
    lines.push({ title, amountMinor });
  }
  return { lines };
}

export const PAYMENT_METHODS = ['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER'];

export const paymentInputSchema = z.object({
  invoiceId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invoice'),
  amountMinor: z.number().int().min(1).max(100_000_000_00),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(60).optional().default(''),
  paidOn: isoDateString,
});

export const adjustmentInputSchema = z.object({
  invoiceId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invoice'),
  kind: z.enum(['DISCOUNT', 'LATE_FEE_REMIT']),
  amountMinor: z.number().int().min(1).max(100_000_000_00),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(300),
});

export const feePlanInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  academicYearId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose an academic year'),
  gradeLevelId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  lines: z.array(z.object({ title: z.string().trim().min(1).max(60), amountMinor: z.number().int().min(1).max(100_000_000_00) })).min(1).max(30),
});

/** Billing month, always YYYY-MM, so "Jan 2026" and "january 2026" can never be two keys. */
export const periodString = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a billing month');

export const reversalInputSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid payment'),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(300),
});

export const voidInvoiceSchema = z.object({
  invoiceId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invoice'),
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters').max(300),
});

export const invoiceGenerationSchema = z.object({
  planId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a plan'),
  period: periodString,
  dueDate: isoDateString,
});
