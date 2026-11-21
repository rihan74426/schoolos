import "server-only";
import { isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import {
  adjustmentInputSchema, feePlanInputSchema, formatMinor, invoiceGenerationSchema, invoiceSummary, paymentInputSchema, remainingDiscountMinor,
} from "@schoolos/core";
import { AcademicYear, AuditEvent, Counter, FeePlan, GradeLevel, Invoice, Payment, Section, Student, withOptionalTransaction } from "@schoolos/db";
import type { Actor } from "./auth";
import { todayInDhaka } from "./dates";
import { getInstitutionPolicy } from "./policy";

type Fail = { ok: false; error: string };
type FeeRules = { currency: string; lateFee: Parameters<typeof invoiceSummary>[1]; scholarshipCapPercent: number };
const MAX_STUDENTS_PER_RUN = 2000;

async function feeRules(institutionId: unknown): Promise<FeeRules | null> {
  const doc = await getInstitutionPolicy(institutionId);
  return ((doc?.policy as { fees?: FeeRules } | undefined)?.fees as FeeRules) ?? null;
}

/** Reserve `n` consecutive numbers; returns the first. Gaps are fine, duplicates are not. */
async function reserveSeq(institutionId: unknown, key: string, n: number, session?: ClientSession | null) {
  const opts = session ? { session } : {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = (await Counter.findOneAndUpdate({ institutionId, key }, { $inc: { seq: n } }, { upsert: true, new: true, ...opts }).lean()) as unknown as { seq: number };
      return doc.seq - n + 1;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || attempt === 2) throw error; // first-ever upsert race
    }
  }
  throw new Error("unreachable");
}
const pad = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;
const idOk = (v: string) => isObjectIdOrHexString(v);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type InvoiceDoc = {
  _id: unknown; invoiceNumber: string; studentId: unknown; planId: unknown; period: string; subtotalMinor: number; discountMinor: number; lateRemitMinor: number;
  paidMinor: number; dueDate: string; status: "OPEN" | "PAID" | "VOID"; settledOn?: string; lateFeeFrozenMinor?: number;
  lines: Array<{ title: string; amountMinor: number }>; adjustments: Array<{ kind: string; amountMinor: number; reason: string; at: Date }>;
};

// ---------- plans ----------

export async function createFeePlan(input: unknown, actor: Actor): Promise<Fail | { ok: true; id: string }> {
  const parsed = feePlanInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fee plan" };
  const { institutionId } = actor;
  const { academicYearId, gradeLevelId, name, lines } = parsed.data;
  if (!(await AcademicYear.exists({ _id: academicYearId, institutionId }))) return { ok: false, error: "Academic year not found" };
  if (gradeLevelId && !(await GradeLevel.exists({ _id: gradeLevelId, institutionId }))) return { ok: false, error: "Class not found" };
  try {
    const id = await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      const [plan] = await FeePlan.create([{ institutionId, name, academicYearId, ...(gradeLevelId ? { gradeLevelId } : {}), lines, createdByMembershipId: actor.membershipId }], opts);
      await AuditEvent.create([{ institutionId, actorMembershipId: actor.membershipId, action: "FEE_PLAN_CREATED", entityType: "FeePlan", entityId: String(plan._id), metadata: { name, lines } }], opts);
      return String(plan._id);
    });
    return { ok: true, id };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { ok: false, error: "A plan with this name already exists for that year" };
    throw error;
  }
}

export async function listFeePlans(actor: Actor) {
  const { institutionId } = actor;
  const [plans, years, levels] = await Promise.all([
    FeePlan.find({ institutionId, status: "ACTIVE" }).sort({ createdAt: -1 }).lean() as unknown as Promise<Array<{ _id: unknown; name: string; academicYearId: unknown; gradeLevelId?: unknown; lines: Array<{ title: string; amountMinor: number }> }>>,
    AcademicYear.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
    GradeLevel.find({ institutionId }).lean() as unknown as Promise<Array<{ _id: unknown; name: string }>>,
  ]);
  const y = new Map(years.map((r) => [String(r._id), r.name]));
  const g = new Map(levels.map((r) => [String(r._id), r.name]));
  return {
    years: years.map((r) => ({ id: String(r._id), name: r.name })),
    levels: levels.map((r) => ({ id: String(r._id), name: r.name })),
    plans: plans.map((p) => ({
      id: String(p._id), name: p.name, year: y.get(String(p.academicYearId)) ?? "—", level: p.gradeLevelId ? g.get(String(p.gradeLevelId)) ?? "—" : "All classes",
      lines: p.lines, totalMinor: p.lines.reduce((s, l) => s + l.amountMinor, 0),
    })),
  };
}

// ---------- invoices ----------

/** One invoice per active student of the plan's class for a period. Re-running never duplicates. */
export async function generateInvoices(input: unknown, actor: Actor): Promise<Fail | { ok: true; created: number; skipped: number }> {
  const parsed = invoiceGenerationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { institutionId } = actor;
  const { planId, period, dueDate } = parsed.data;
  const plan = (await FeePlan.findOne({ _id: planId, institutionId, status: "ACTIVE" }).lean()) as unknown as
    | { _id: unknown; academicYearId: unknown; gradeLevelId?: unknown; lines: Array<{ title: string; amountMinor: number }> } | null;
  if (!plan) return { ok: false, error: "Fee plan not found" };

  let studentFilter: Record<string, unknown> = { institutionId, status: "ACTIVE" };
  if (plan.gradeLevelId) {
    const sectionIds = await Section.find({ institutionId, academicYearId: plan.academicYearId, gradeLevelId: plan.gradeLevelId }).distinct("_id");
    studentFilter = { ...studentFilter, sectionId: { $in: sectionIds } };
  }
  const students = (await Student.find(studentFilter).select("_id").limit(MAX_STUDENTS_PER_RUN + 1).lean()) as unknown as Array<{ _id: unknown }>;
  if (students.length > MAX_STUDENTS_PER_RUN) return { ok: false, error: `Too many students for one run (max ${MAX_STUDENTS_PER_RUN}). Use a class-specific plan.` };
  if (!students.length) return { ok: false, error: "No active students match this plan" };

  const existing = new Set(((await Invoice.find({ institutionId, planId, period }).select("studentId").lean()) as unknown as Array<{ studentId: unknown }>).map((i) => String(i.studentId)));
  const fresh = students.filter((s) => !existing.has(String(s._id)));
  if (!fresh.length) return { ok: true, created: 0, skipped: students.length };

  const subtotalMinor = plan.lines.reduce((s, l) => s + l.amountMinor, 0);
  const created = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const first = await reserveSeq(institutionId, "invoice", fresh.length, txn);
    const docs = fresh.map((s, i) => ({
      institutionId, invoiceNumber: pad("INV", first + i), studentId: s._id, planId, period, lines: plan.lines, subtotalMinor, dueDate, createdByMembershipId: actor.membershipId,
    }));
    let inserted = docs.length;
    try {
      await Invoice.insertMany(docs, { ordered: false, ...opts });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || txn) throw error; // concurrent run won some rows
      inserted = (await Invoice.countDocuments({ institutionId, planId, period })) - existing.size;
    }
    await AuditEvent.create([{ institutionId, actorMembershipId: actor.membershipId, action: "INVOICES_GENERATED", entityType: "FeePlan", entityId: String(planId), metadata: { period, dueDate, created: inserted, skipped: students.length - fresh.length } }], opts);
    return inserted;
  });
  return { ok: true, created, skipped: students.length - created };
}

function settleFields(balanceAfter: number, lateFeeMinor: number, asOf: string) {
  return balanceAfter === 0 ? { status: "PAID", settledOn: asOf, lateFeeFrozenMinor: lateFeeMinor } : {};
}

export async function recordPayment(input: unknown, actor: Actor): Promise<Fail | { ok: true; paymentId: string; receiptNumber: string; settled: boolean }> {
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment" };
  const { institutionId } = actor;
  const { invoiceId, amountMinor, method, reference, paidOn } = parsed.data;
  if (paidOn > todayInDhaka()) return { ok: false, error: "Payment date cannot be in the future" };
  const rules = await feeRules(institutionId);
  if (!rules) return { ok: false, error: "Fee rules are not set up" };

  const inv = (await Invoice.findOne({ _id: invoiceId, institutionId }).lean()) as unknown as InvoiceDoc | null;
  if (!inv) return { ok: false, error: "Invoice not found" };
  if (inv.status !== "OPEN") return { ok: false, error: inv.status === "PAID" ? "Invoice is already paid" : "Invoice is void" };

  const before = invoiceSummary(inv, rules.lateFee, paidOn);
  if (amountMinor > before.balanceMinor) return { ok: false, error: `Amount is more than the balance (${formatMinor(before.balanceMinor, rules.currency)})` };
  const balanceAfter = before.balanceMinor - amountMinor;
  const settle = settleFields(balanceAfter, before.lateFeeMinor, paidOn);

  const run = async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    // Guard: only succeeds if nobody else changed the invoice since we read it.
    const claimed = await Invoice.updateOne(
      { _id: invoiceId, institutionId, status: "OPEN", paidMinor: inv.paidMinor, discountMinor: inv.discountMinor, lateRemitMinor: inv.lateRemitMinor },
      { $inc: { paidMinor: amountMinor }, ...(Object.keys(settle).length ? { $set: settle } : {}) },
      opts,
    );
    if (!claimed.modifiedCount) return null;
    const receiptNumber = pad("R", await reserveSeq(institutionId, "receipt", 1, txn));
    try {
      const [payment] = await Payment.create([{ institutionId, invoiceId, studentId: inv.studentId, amountMinor, method, reference, paidOn, receiptNumber, receivedByMembershipId: actor.membershipId }], opts);
      await AuditEvent.create([{ institutionId, actorMembershipId: actor.membershipId, action: "PAYMENT_RECORDED", entityType: "Invoice", entityId: invoiceId, metadata: { receiptNumber, amountMinor, method, paidOn, settled: balanceAfter === 0 } }], opts);
      return { paymentId: String(payment._id), receiptNumber };
    } catch (error) {
      if (!txn) await Invoice.updateOne({ _id: invoiceId, institutionId }, { $inc: { paidMinor: -amountMinor }, $set: { status: "OPEN" }, $unset: { settledOn: 1, lateFeeFrozenMinor: 1 } }); // standalone Mongo: undo
      throw error;
    }
  };
  const done = await withOptionalTransaction(run);
  if (!done) return { ok: false, error: "The invoice changed while saving. Reload and try again." };
  return { ok: true, ...done, settled: balanceAfter === 0 };
}

/** Discount (within the scholarship cap) or late-fee remit. Needs a reason; audited. */
export async function applyAdjustment(input: unknown, actor: Actor): Promise<Fail | { ok: true; settled: boolean }> {
  const parsed = adjustmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid adjustment" };
  const { institutionId } = actor;
  const { invoiceId, kind, amountMinor, reason } = parsed.data;
  const rules = await feeRules(institutionId);
  if (!rules) return { ok: false, error: "Fee rules are not set up" };
  const inv = (await Invoice.findOne({ _id: invoiceId, institutionId }).lean()) as unknown as InvoiceDoc | null;
  if (!inv) return { ok: false, error: "Invoice not found" };
  if (inv.status !== "OPEN") return { ok: false, error: "Only open invoices can be adjusted" };

  const today = todayInDhaka();
  const now = invoiceSummary(inv, rules.lateFee, today);
  const next = { ...inv };
  if (kind === "DISCOUNT") {
    const room = remainingDiscountMinor(inv.subtotalMinor, inv.discountMinor, rules.scholarshipCapPercent);
    if (amountMinor > room) return { ok: false, error: `Discounts are capped at ${rules.scholarshipCapPercent}% of the invoice. You can still give ${formatMinor(room, rules.currency)}.` };
    next.discountMinor += amountMinor;
  } else {
    if (amountMinor > now.lateDueMinor) return { ok: false, error: `Only ${formatMinor(now.lateDueMinor, rules.currency)} of late fee is currently charged` };
    next.lateRemitMinor += amountMinor;
  }
  const after = invoiceSummary(next, rules.lateFee, today);
  if (after.totalMinor < inv.paidMinor) return { ok: false, error: "This is more than the unpaid balance. Money already received would exceed the bill." };
  const settle = settleFields(after.balanceMinor, after.lateFeeMinor, today);

  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const claimed = await Invoice.updateOne(
      { _id: invoiceId, institutionId, status: "OPEN", paidMinor: inv.paidMinor, discountMinor: inv.discountMinor, lateRemitMinor: inv.lateRemitMinor },
      {
        $inc: kind === "DISCOUNT" ? { discountMinor: amountMinor } : { lateRemitMinor: amountMinor },
        $push: { adjustments: { kind, amountMinor, reason, byMembershipId: actor.membershipId, at: new Date() } },
        ...(Object.keys(settle).length ? { $set: settle } : {}),
      },
      opts,
    );
    if (!claimed.modifiedCount) return false;
    await AuditEvent.create([{ institutionId, actorMembershipId: actor.membershipId, action: "FEE_ADJUSTMENT", entityType: "Invoice", entityId: invoiceId, metadata: { kind, amountMinor, reason, balanceBefore: now.balanceMinor, balanceAfter: after.balanceMinor } }], opts);
    return true;
  });
  if (!done) return { ok: false, error: "The invoice changed while saving. Reload and try again." };
  return { ok: true, settled: after.balanceMinor === 0 };
}

// ---------- reads ----------

type Filter = { status?: string; q?: string; page?: number };

export async function listInvoices(actor: Actor, filter: Filter = {}) {
  const { institutionId } = actor;
  const rules = await feeRules(institutionId);
  const today = todayInDhaka();
  const query: Record<string, unknown> = { institutionId, status: { $ne: "VOID" } };
  if (filter.status === "PAID") query.status = "PAID";
  if (filter.status === "OPEN") query.status = "OPEN";
  if (filter.status === "OVERDUE") Object.assign(query, { status: "OPEN", dueDate: { $lt: today } });
  const q = filter.q?.trim();
  if (q) {
    const re = new RegExp(escapeRe(q), "i");
    const ids = await Student.find({ institutionId, $or: [{ studentNumber: re }, { firstName: re }, { lastName: re }] }).select("_id").limit(200).lean();
    query.studentId = { $in: ids.map((s: { _id: unknown }) => s._id) };
  }
  const size = 25;
  const skip = (Math.max(1, Math.floor(filter.page ?? 1)) - 1) * size;
  const [rows, total] = await Promise.all([
    Invoice.find(query).sort({ dueDate: 1, invoiceNumber: 1 }).skip(skip).limit(size).lean() as unknown as Promise<InvoiceDoc[]>,
    Invoice.countDocuments(query),
  ]);
  const studentIds = [...new Set(rows.map((r) => String(r.studentId)))];
  const students = studentIds.length ? ((await Student.find({ institutionId, _id: { $in: studentIds } }).lean()) as unknown as Array<{ _id: unknown; studentNumber: string; firstName: string; lastName?: string }>) : [];
  const names = new Map(students.map((s) => [String(s._id), { number: s.studentNumber, name: [s.firstName, s.lastName].filter(Boolean).join(" ") }]));
  return {
    total, pageSize: size, currency: rules?.currency ?? "BDT",
    rows: rows.map((r) => {
      const s = rules ? invoiceSummary(r, rules.lateFee, today) : null;
      return { id: String(r._id), number: r.invoiceNumber, period: r.period, dueDate: r.dueDate, status: r.status, student: names.get(String(r.studentId)) ?? { number: "?", name: "—" }, totalMinor: s?.totalMinor ?? r.subtotalMinor, balanceMinor: s?.balanceMinor ?? r.subtotalMinor, overdue: s?.overdue ?? false };
    }),
  };
}

export async function getInvoiceDetail(actor: Actor, invoiceId: string) {
  if (!idOk(invoiceId)) return null;
  const { institutionId } = actor;
  const inv = (await Invoice.findOne({ _id: invoiceId, institutionId }).lean()) as unknown as InvoiceDoc | null;
  const rules = await feeRules(institutionId);
  if (!inv || !rules) return null;
  const [student, payments] = await Promise.all([
    Student.findOne({ _id: inv.studentId, institutionId }).lean() as unknown as Promise<{ studentNumber: string; firstName: string; lastName?: string } | null>,
    Payment.find({ institutionId, invoiceId }).sort({ createdAt: 1 }).lean() as unknown as Promise<Array<{ _id: unknown; receiptNumber: string; amountMinor: number; method: string; reference: string; paidOn: string }>>,
  ]);
  const today = todayInDhaka();
  return {
    invoice: { id: String(inv._id), number: inv.invoiceNumber, period: inv.period, dueDate: inv.dueDate, status: inv.status, settledOn: inv.settledOn, lines: inv.lines, subtotalMinor: inv.subtotalMinor, discountMinor: inv.discountMinor, paidMinor: inv.paidMinor, adjustments: inv.adjustments.map((a) => ({ ...a, at: a.at.toISOString() })) },
    summary: invoiceSummary(inv, rules.lateFee, today),
    currency: rules.currency,
    scholarshipCapPercent: rules.scholarshipCapPercent,
    student: student ? { number: student.studentNumber, name: [student.firstName, student.lastName].filter(Boolean).join(" ") } : { number: "?", name: "—" },
    payments: payments.map((p) => ({ id: String(p._id), receiptNumber: p.receiptNumber, amountMinor: p.amountMinor, method: p.method, reference: p.reference, paidOn: p.paidOn })),
  };
}

export async function getReceipt(actor: Actor, paymentId: string) {
  if (!idOk(paymentId)) return null;
  const { institutionId } = actor;
  const pay = (await Payment.findOne({ _id: paymentId, institutionId }).lean()) as unknown as { invoiceId: unknown; receiptNumber: string; amountMinor: number; method: string; reference: string; paidOn: string } | null;
  if (!pay) return null;
  const detail = await getInvoiceDetail(actor, String(pay.invoiceId));
  if (!detail) return null;
  return { receipt: { receiptNumber: pay.receiptNumber, amountMinor: pay.amountMinor, method: pay.method, reference: pay.reference, paidOn: pay.paidOn }, ...detail };
}

export async function collectionSummary(actor: Actor) {
  const { institutionId } = actor;
  const rules = await feeRules(institutionId);
  const today = todayInDhaka();
  const invoices = (await Invoice.find({ institutionId, status: { $ne: "VOID" } }).limit(20000).lean()) as unknown as InvoiceDoc[];
  const out = { currency: rules?.currency ?? "BDT", invoices: invoices.length, billedMinor: 0, collectedMinor: 0, outstandingMinor: 0, overdueCount: 0, overdueMinor: 0 };
  if (!rules) return out;
  for (const inv of invoices) {
    const s = invoiceSummary(inv, rules.lateFee, today);
    out.billedMinor += s.totalMinor;
    out.collectedMinor += inv.paidMinor;
    out.outstandingMinor += s.balanceMinor;
    if (s.overdue) { out.overdueCount += 1; out.overdueMinor += s.balanceMinor; }
  }
  return out;
}
