import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildInitialPolicy } from "@schoolos/core";
import { AcademicYear, AuditEvent, Counter, FeePlan, GradeLevel, Invoice, InstitutionPolicy, Payment, Section, Student } from "@schoolos/db";
import { todayInDhaka } from "@/server/dates";
import { applyAdjustment, collectionSummary, createFeePlan, generateInvoices, getInvoiceDetail, listInvoices, recordPayment } from "@/server/invoices";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const A = oid();
const B = oid();
const as = (institutionId = A, role = "ACCOUNTS") => ({ membershipId: oid(), institutionId, role });
const today = todayInDhaka();
const daysAgo = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
let yearId: mongoose.Types.ObjectId;
let class5: mongoose.Types.ObjectId;
let planId = "";
const pay = (invoiceId: string, amountMinor: number, extra: Record<string, unknown> = {}) =>
  recordPayment({ invoiceId, amountMinor, method: "CASH", paidOn: today, ...extra }, as());
const invoiceFor = async (period: string, dueDate: string, studentNumber = "C5-1") => {
  const stu = (await Student.findOne({ institutionId: A, studentNumber }).lean()) as unknown as { _id: unknown };
  await generateInvoices({ planId, period, dueDate }, as());
  return String(((await Invoice.findOne({ institutionId: A, studentId: stu._id, period }).lean()) as unknown as { _id: unknown })._id);
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([FeePlan, Invoice, Payment, Counter, Student, Section, AcademicYear, GradeLevel, InstitutionPolicy, AuditEvent].map((m) => m.syncIndexes()));
  const fees = { currency: "BDT", lateFee: { mode: "FLAT", flatMinor: 10000, graceDays: 2 }, scholarshipCapPercent: 50 };
  for (const id of [A, B]) await InstitutionPolicy.create({ institutionId: id, policy: buildInitialPolicy("bd-school", { fees }), version: 1 });
  yearId = oid();
  await AcademicYear.create({ _id: yearId, institutionId: A, name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", isCurrent: true });
  class5 = (await GradeLevel.create({ institutionId: A, name: "Class 5", order: 5 }))._id;
  const class6 = (await GradeLevel.create({ institutionId: A, name: "Class 6", order: 6 }))._id;
  const s5 = await Section.create({ institutionId: A, academicYearId: yearId, gradeLevelId: class5, name: "A" });
  const s6 = await Section.create({ institutionId: A, academicYearId: yearId, gradeLevelId: class6, name: "A" });
  await Student.create([
    { institutionId: A, studentNumber: "C5-1", firstName: "One", sectionId: s5._id },
    { institutionId: A, studentNumber: "C5-2", firstName: "Two", sectionId: s5._id },
    { institutionId: A, studentNumber: "C5-3", firstName: "Three", sectionId: s5._id },
    { institutionId: A, studentNumber: "C5-W", firstName: "Gone", sectionId: s5._id, status: "WITHDRAWN" },
    { institutionId: A, studentNumber: "C6-1", firstName: "Six", sectionId: s6._id },
  ]);
  const otherYear = oid();
  const otherLevel = (await GradeLevel.create({ institutionId: B, name: "Class 5", order: 5 }))._id;
  const sb = await Section.create({ institutionId: B, academicYearId: otherYear, gradeLevelId: otherLevel, name: "A" });
  await Student.create({ institutionId: B, studentNumber: "B-1", firstName: "Other", sectionId: sb._id });
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("fee plans", () => {
  const lines = [{ title: "Tuition", amountMinor: 100000 }];
  it("creates with an audit event and rejects bad references and duplicates", async () => {
    const res = await createFeePlan({ name: "Class 5 monthly", academicYearId: String(yearId), gradeLevelId: String(class5), lines }, as(A, "PRINCIPAL"));
    expect(res.ok).toBe(true);
    planId = (res as { id: string }).id;
    expect(await AuditEvent.countDocuments({ institutionId: A, action: "FEE_PLAN_CREATED" })).toBe(1);
    expect(await createFeePlan({ name: "Class 5 monthly", academicYearId: String(yearId), lines }, as())).toMatchObject({ ok: false, error: "A plan with this name already exists for that year" });
    expect(await createFeePlan({ name: "X plan", academicYearId: String(oid()), lines }, as())).toMatchObject({ ok: false, error: "Academic year not found" });
    expect(await createFeePlan({ name: "X plan", academicYearId: String(yearId), gradeLevelId: String(oid()), lines }, as())).toMatchObject({ ok: false, error: "Class not found" });
    expect(await createFeePlan({ name: "X plan", academicYearId: String(yearId), lines: [] }, as())).toMatchObject({ ok: false });
    expect(await createFeePlan({ name: "Y plan", academicYearId: String(yearId), lines }, as(B))).toMatchObject({ ok: false, error: "Academic year not found" }); // other school
  });
});

describe("generateInvoices", () => {
  it("bills active students of that class only, with sequential numbers, and is idempotent", async () => {
    expect(await generateInvoices({ planId, period: "2026-12", dueDate: daysAgo(-10) }, as())).toEqual({ ok: true, created: 3, skipped: 0 });
    const nums = ((await Invoice.find({ institutionId: A, period: "2026-12" }).lean()) as unknown as Array<{ invoiceNumber: string }>).map((i) => i.invoiceNumber).sort();
    expect(nums).toEqual(["INV-000001", "INV-000002", "INV-000003"]);
    expect(await generateInvoices({ planId, period: "2026-12", dueDate: daysAgo(-10) }, as())).toEqual({ ok: true, created: 0, skipped: 3 });
    expect(await Invoice.countDocuments({ institutionId: A, period: "2026-12" })).toBe(3);
  });
  it("never uses another school's plan or students", async () => {
    expect(await generateInvoices({ planId, period: "2026-12", dueDate: daysAgo(-10) }, as(B))).toMatchObject({ ok: false, error: "Fee plan not found" });
    expect(await Invoice.countDocuments({ institutionId: B })).toBe(0);
  });
  it("an all-classes plan bills every active student", async () => {
    const all = (await createFeePlan({ name: "Admission", academicYearId: String(yearId), lines: [{ title: "Form", amountMinor: 50000 }] }, as())) as { id: string };
    expect(await generateInvoices({ planId: all.id, period: "once", dueDate: daysAgo(-5) }, as())).toEqual({ ok: true, created: 4, skipped: 0 });
  });
});

describe("recordPayment", () => {
  it("takes partial payments, issues sequential receipts, and settles exactly", async () => {
    const inv = await invoiceFor("2026-12", daysAgo(-10));
    expect(await pay(inv, 40000)).toMatchObject({ ok: true, receiptNumber: "R-000001", settled: false });
    expect(await pay(inv, 70000)).toMatchObject({ ok: false });
    expect(await pay(inv, 60000)).toMatchObject({ ok: true, receiptNumber: "R-000002", settled: true });
    expect(await Invoice.findOne({ institutionId: A, _id: inv }).lean()).toMatchObject({ status: "PAID", paidMinor: 100000, lateFeeFrozenMinor: 0, settledOn: today });
    expect(await pay(inv, 100)).toMatchObject({ ok: false, error: "Invoice is already paid" });
    expect(await Payment.countDocuments({ institutionId: A, invoiceId: inv })).toBe(2);
  });
  it("rejects overpayment, future dates and other schools' invoices", async () => {
    const inv = await invoiceFor("2026-12", daysAgo(-10), "C5-2");
    expect(await pay(inv, 100001)).toMatchObject({ ok: false });
    expect(await pay(inv, 1000, { paidOn: daysAgo(-1) })).toMatchObject({ ok: false, error: "Payment date cannot be in the future" });
    expect(await recordPayment({ invoiceId: inv, amountMinor: 1000, method: "CASH", paidOn: today }, as(B))).toMatchObject({ ok: false, error: "Invoice not found" });
    expect(await pay(inv, 5, { method: "CHEQUE" })).toMatchObject({ ok: false });
  });
  it("charges the late fee by payment date: on time = none, late = flat fee frozen at settlement", async () => {
    const lateInv = await invoiceFor("late-1", daysAgo(10), "C5-3"); // 10 days overdue, grace 2 -> 100 BDT
    const detail = await getInvoiceDetail(as(), lateInv);
    expect(detail?.summary).toMatchObject({ lateFeeMinor: 10000, totalMinor: 110000, overdue: true });
    expect(await pay(lateInv, 100000, { paidOn: daysAgo(10) })).toMatchObject({ ok: true, settled: true }); // paid on the due date: no late fee
    expect(await Invoice.findOne({ institutionId: A, _id: lateInv }).lean()).toMatchObject({ lateFeeFrozenMinor: 0 });

    const lateInv2 = await invoiceFor("late-2", daysAgo(10), "C5-2");
    expect(await pay(lateInv2, 100000)).toMatchObject({ ok: true, settled: false }); // 100 BDT late fee still owed
    expect(await pay(lateInv2, 10000)).toMatchObject({ ok: true, settled: true });
    expect(await Invoice.findOne({ institutionId: A, _id: lateInv2 }).lean()).toMatchObject({ status: "PAID", lateFeeFrozenMinor: 10000 });
  });
  it("lets only one of two simultaneous full payments through", async () => {
    const inv = await invoiceFor("race", daysAgo(-10), "C5-1");
    const results = await Promise.all([pay(inv, 100000), pay(inv, 100000)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await Payment.countDocuments({ institutionId: A, invoiceId: inv })).toBe(1);
    expect(await Invoice.findOne({ institutionId: A, _id: inv }).lean()).toMatchObject({ paidMinor: 100000, status: "PAID" });
  });
});

describe("adjustments", () => {
  it("caps discounts at the scholarship percent and needs a reason", async () => {
    const inv = await invoiceFor("adj-1", daysAgo(-10), "C5-3");
    const reason = "Sibling concession approved by principal";
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 50001, reason }, as(A, "ACADEMIC_COORDINATOR"))).toMatchObject({ ok: false });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 20000, reason: "short" }, as())).toMatchObject({ ok: false });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 30000, reason }, as())).toEqual({ ok: true, settled: false });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 20001, reason }, as())).toMatchObject({ ok: false }); // 50% total cap
    expect(await applyAdjustment({ invoiceId: inv, kind: "LATE_FEE_REMIT", amountMinor: 100, reason }, as())).toMatchObject({ ok: false }); // not late yet
    const audit = (await AuditEvent.findOne({ institutionId: A, action: "FEE_ADJUSTMENT", entityId: inv }).lean()) as unknown as { metadata: { balanceBefore: number; balanceAfter: number } };
    expect(audit.metadata).toMatchObject({ balanceBefore: 100000, balanceAfter: 70000 });
  });
  it("remits part of a charged late fee, never more than is charged", async () => {
    const inv = await invoiceFor("adj-late", daysAgo(10), "C5-2");
    const reason = "Family hardship, approved by vice principal";
    expect(await applyAdjustment({ invoiceId: inv, kind: "LATE_FEE_REMIT", amountMinor: 10001, reason }, as())).toMatchObject({ ok: false });
    expect(await applyAdjustment({ invoiceId: inv, kind: "LATE_FEE_REMIT", amountMinor: 4000, reason }, as())).toEqual({ ok: true, settled: false });
    expect((await getInvoiceDetail(as(), inv))?.summary).toMatchObject({ lateDueMinor: 6000, totalMinor: 106000 });
  });
  it("settles the invoice when a discount clears the balance, then locks it", async () => {
    const inv = await invoiceFor("adj-settle", daysAgo(-10), "C5-1");
    expect(await pay(inv, 50000)).toMatchObject({ ok: true });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 50000, reason: "Scholarship awarded for the term" }, as())).toEqual({ ok: true, settled: true });
    expect(await Invoice.findOne({ institutionId: A, _id: inv }).lean()).toMatchObject({ status: "PAID", discountMinor: 50000 });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 100, reason: "Trying again after payment" }, as())).toMatchObject({ ok: false, error: "Only open invoices can be adjusted" });
  });
  it("refuses a discount that would push the bill below money already received", async () => {
    const inv = await invoiceFor("adj-over", daysAgo(-10), "C5-3");
    expect(await pay(inv, 80000)).toMatchObject({ ok: true });
    expect(await applyAdjustment({ invoiceId: inv, kind: "DISCOUNT", amountMinor: 30000, reason: "Concession requested by family" }, as())).toMatchObject({ ok: false });
  });
});

describe("reads", () => {
  it("lists tenant-scoped invoices with filters and summarises collection", async () => {
    const all = await listInvoices(as(), {});
    expect(all.total).toBeGreaterThan(5);
    expect((await listInvoices(as(), { status: "PAID" })).rows.every((r) => r.status === "PAID")).toBe(true);
    const overdue = await listInvoices(as(), { status: "OVERDUE" });
    expect(overdue.rows.every((r) => r.overdue)).toBe(true);
    expect((await listInvoices(as(), { q: "Two" })).rows.every((r) => r.student.name === "Two")).toBe(true);
    expect((await listInvoices(as(B), {})).total).toBe(0);
    const sum = await collectionSummary(as());
    expect(sum.invoices).toBe(await Invoice.countDocuments({ institutionId: A }));
    expect(sum.billedMinor).toBeGreaterThanOrEqual(sum.collectedMinor);
    expect(sum.outstandingMinor).toBeGreaterThan(0);
    expect((await collectionSummary(as(B))).invoices).toBe(0);
  });
  it("returns nothing for another school or a bad id", async () => {
    const some = (await Invoice.findOne({ institutionId: A }).lean()) as unknown as { _id: unknown };
    expect(await getInvoiceDetail(as(B), String(some._id))).toBeNull();
    expect(await getInvoiceDetail(as(), "nope")).toBeNull();
  });
});
