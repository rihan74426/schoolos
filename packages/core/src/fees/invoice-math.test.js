import { describe, expect, it } from 'vitest';
import { adjustmentInputSchema, daysLate, invoiceGenerationSchema, invoiceSummary, parseFeeLines, paymentInputSchema, remainingDiscountMinor, reversalInputSchema, voidInvoiceSchema } from '../index.js';

const none = { mode: 'NONE' };
const flat = { mode: 'FLAT', flatMinor: 10000, graceDays: 2 };
const pct = { mode: 'PERCENT_PER_DAY', percent: 5, graceDays: 0, capPercent: 20 };
const inv = (extra = {}) => ({ subtotalMinor: 100000, discountMinor: 0, lateRemitMinor: 0, paidMinor: 0, dueDate: '2026-11-10', status: 'OPEN', ...extra });

describe('daysLate', () => {
  it('counts whole school days and never goes negative', () => {
    expect(daysLate('2026-11-10', '2026-11-10')).toBe(0);
    expect(daysLate('2026-11-10', '2026-11-09')).toBe(0);
    expect(daysLate('2026-11-10', '2026-11-15')).toBe(5);
    expect(daysLate('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('invoiceSummary', () => {
  it('has no late fee when the school chose none, even when overdue', () => {
    const s = invoiceSummary(inv(), none, '2026-12-31');
    expect(s).toMatchObject({ lateFeeMinor: 0, totalMinor: 100000, balanceMinor: 100000, overdue: true });
  });
  it('applies a flat fee after the grace days', () => {
    expect(invoiceSummary(inv(), flat, '2026-11-12').lateFeeMinor).toBe(0); // 2 days = inside grace
    expect(invoiceSummary(inv(), flat, '2026-11-13')).toMatchObject({ lateFeeMinor: 10000, totalMinor: 110000 });
  });
  it('applies percent per day up to the cap, on the net principal', () => {
    const s = invoiceSummary(inv({ discountMinor: 20000 }), pct, '2026-11-12'); // 2 days * 5% of 80,000
    expect(s.lateFeeMinor).toBe(8000);
    expect(invoiceSummary(inv(), pct, '2027-03-01').lateFeeMinor).toBe(20000); // capped at 20%
  });
  it('subtracts remitted late fee but never below zero', () => {
    expect(invoiceSummary(inv({ lateRemitMinor: 4000 }), flat, '2026-11-20').lateDueMinor).toBe(6000);
    expect(invoiceSummary(inv({ lateRemitMinor: 99999 }), flat, '2026-11-20').lateDueMinor).toBe(0);
  });
  it('freezes the late fee once settled', () => {
    const settled = inv({ status: 'PAID', lateFeeFrozenMinor: 10000, paidMinor: 110000 });
    expect(invoiceSummary(settled, pct, '2027-06-01')).toMatchObject({ lateFeeMinor: 10000, balanceMinor: 0, overdue: false });
  });
  it('tracks partial payment and is not overdue before the due date', () => {
    expect(invoiceSummary(inv({ paidMinor: 40000 }), none, '2026-11-01')).toMatchObject({ balanceMinor: 60000, overdue: false });
  });
});

describe('discount cap', () => {
  it('limits total discounts to the scholarship cap', () => {
    expect(remainingDiscountMinor(100000, 0, 50)).toBe(50000);
    expect(remainingDiscountMinor(100000, 30000, 50)).toBe(20000);
    expect(remainingDiscountMinor(100000, 60000, 50)).toBe(0);
    expect(remainingDiscountMinor(100000, 0, 0)).toBe(0);
  });
});

describe('parseFeeLines', () => {
  it('parses title: taka lines', () => {
    expect(parseFeeLines('Tuition: 1500\nExam fee: 250.50\n\n')).toEqual({ lines: [{ title: 'Tuition', amountMinor: 150000 }, { title: 'Exam fee', amountMinor: 25050 }] });
  });
  it('keeps colons inside titles', () => {
    expect(parseFeeLines('Hostel: single room: 3000').lines[0]).toEqual({ title: 'Hostel: single room', amountMinor: 300000 });
  });
  it('rejects empty, zero, negative and malformed lines', () => {
    for (const bad of ['', 'Tuition', 'Tuition: 0', 'Tuition: -5', ': 100', 'Tuition: 1.234', 'Tuition: abc']) expect(parseFeeLines(bad).error).toBeTruthy();
  });
});

describe('input schemas', () => {
  const id = 'a'.repeat(24);
  it('payments need whole paisa, a known method and a real date', () => {
    expect(paymentInputSchema.safeParse({ invoiceId: id, amountMinor: 5000, method: 'BKASH', paidOn: '2026-11-20' }).success).toBe(true);
    expect(paymentInputSchema.safeParse({ invoiceId: id, amountMinor: 0, method: 'CASH', paidOn: '2026-11-20' }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ invoiceId: id, amountMinor: 10.5, method: 'CASH', paidOn: '2026-11-20' }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ invoiceId: id, amountMinor: 100, method: 'CHEQUE', paidOn: '2026-11-20' }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ invoiceId: id, amountMinor: 100, method: 'CASH', paidOn: '2026-02-30' }).success).toBe(false);
  });
  it('adjustments need a reason of 10+ characters', () => {
    expect(adjustmentInputSchema.safeParse({ invoiceId: id, kind: 'DISCOUNT', amountMinor: 100, reason: 'short' }).success).toBe(false);
    expect(adjustmentInputSchema.safeParse({ invoiceId: id, kind: 'LATE_FEE_REMIT', amountMinor: 100, reason: 'Family hardship, approved by principal' }).success).toBe(true);
  });
  it('billing period is a YYYY-MM month', () => {
    const base = { planId: id, dueDate: '2026-12-10' };
    expect(invoiceGenerationSchema.safeParse({ ...base, period: '2026-12' }).success).toBe(true);
    for (const bad of ['Jan 2026', 'january 2026', '2026-13', '2026-1', '2026-12-01', 'once']) expect(invoiceGenerationSchema.safeParse({ ...base, period: bad }).success).toBe(false);
  });
  it('reversal and void need a reason of 10+ characters', () => {
    expect(reversalInputSchema.safeParse({ paymentId: id, reason: 'Wrong student' }).success).toBe(true);
    expect(reversalInputSchema.safeParse({ paymentId: id, reason: 'oops' }).success).toBe(false);
    expect(voidInvoiceSchema.safeParse({ invoiceId: id, reason: 'Billed to wrong class' }).success).toBe(true);
    expect(voidInvoiceSchema.safeParse({ invoiceId: id, reason: '' }).success).toBe(false);
  });
});
