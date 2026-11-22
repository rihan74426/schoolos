"use server";

import { revalidatePath } from "next/cache";
import { parseFeeLines, takaToMinor } from "@schoolos/core";
import { authFailure, requirePermission } from "@/server/auth";
import type { Actor } from "@/server/auth";
import { updateFeePolicy } from "@/server/fees";
import { applyAdjustment, createFeePlan, generateInvoices, recordPayment, reversePayment, voidInvoice } from "@/server/invoices";
import { getInstitutionPolicy } from "@/server/policy";

export type FormState = { ok: boolean; message: string } | null;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const whole = (fd: FormData, key: string, fallback: number) => {
  const raw = text(fd, key);
  return raw === "" ? fallback : Number(raw);
};

export async function updateFeeRulesAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await requirePermission("fees:configure");
    const current = await getInstitutionPolicy(actor.institutionId);
    if (!current) return { ok: false, message: "Policy not found" };
    const base = (current.policy as { fees: { currency: string } }).fees;

    const mode = text(fd, "lateMode");
    const graceDays = whole(fd, "graceDays", 0);
    let lateFee: Record<string, unknown>;
    if (mode === "FLAT") {
      const flatMinor = takaToMinor(text(fd, "lateAmount"));
      if (flatMinor === null) return { ok: false, message: "Enter the late fee as taka, for example 100 or 100.50" };
      lateFee = { mode, flatMinor, graceDays };
    } else if (mode === "PERCENT_PER_DAY") {
      lateFee = { mode, percent: Number(text(fd, "lateAmount")), graceDays, capPercent: whole(fd, "capPercent", 100) };
    } else if (mode === "NONE") {
      lateFee = { mode };
    } else {
      return { ok: false, message: "Choose a late fee type" };
    }

    const result = await updateFeePolicy(
      { currency: base.currency, lateFee, scholarshipCapPercent: whole(fd, "scholarshipCapPercent", 0) },
      Number(text(fd, "version")),
      actor,
    );
    if (!result.ok) return { ok: false, message: result.error };
    revalidatePath("/admin/finance/fees");
    return { ok: true, message: "Fee rules saved" };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

// ---------- plans, invoices, payments, adjustments ----------

type Outcome = { ok: true; message?: string } | { ok: false; error: string };

async function guard(permission: string, fn: (actor: Actor) => Promise<Outcome>, okMessage: string, path = "/admin/finance/fees"): Promise<FormState> {
  try {
    const actor = await requirePermission(permission);
    const res = await fn(actor);
    if (!res.ok) return { ok: false, message: res.error };
    revalidatePath(path, "layout");
    return { ok: true, message: res.message ?? okMessage };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

export async function createFeePlanAction(_: FormState, fd: FormData) {
  return guard("fees:configure", async (actor) => {
    const parsedLines = parseFeeLines(text(fd, "lines"));
    if (!parsedLines.lines) return { ok: false as const, error: parsedLines.error ?? "Invalid fee lines" };
    return createFeePlan({ name: text(fd, "name"), academicYearId: text(fd, "academicYearId"), ...(text(fd, "gradeLevelId") ? { gradeLevelId: text(fd, "gradeLevelId") } : {}), lines: parsedLines.lines }, actor);
  }, "Fee plan created");
}

export async function generateInvoicesAction(_: FormState, fd: FormData) {
  return guard("fees:write", async (actor) => {
    const res = await generateInvoices({ planId: text(fd, "planId"), period: text(fd, "period"), dueDate: text(fd, "dueDate") }, actor);
    return res.ok ? { ok: true as const, message: `${res.created} invoice(s) created, ${res.skipped} already existed` } : res;
  }, "Invoices generated");
}

export async function recordPaymentAction(_: FormState, fd: FormData) {
  return guard("fees:write", async (actor) => {
    const amountMinor = takaToMinor(text(fd, "amount"));
    if (amountMinor === null) return { ok: false as const, error: "Enter the amount in taka, for example 1500 or 1500.50" };
    const res = await recordPayment({ invoiceId: text(fd, "invoiceId"), amountMinor, method: text(fd, "method"), reference: text(fd, "reference"), paidOn: text(fd, "paidOn") }, actor);
    return res.ok ? { ok: true as const, message: `Receipt ${res.receiptNumber} issued${res.settled ? ". Invoice fully paid." : ""}` } : res;
  }, "Payment recorded");
}

export async function applyAdjustmentAction(_: FormState, fd: FormData) {
  return guard("fees:waive", async (actor) => {
    const amountMinor = takaToMinor(text(fd, "amount"));
    if (amountMinor === null) return { ok: false as const, error: "Enter the amount in taka, for example 500 or 500.50" };
    const res = await applyAdjustment({ invoiceId: text(fd, "invoiceId"), kind: text(fd, "kind"), amountMinor, reason: text(fd, "reason") }, actor);
    return res.ok ? { ok: true as const, message: res.settled ? "Adjustment saved. Invoice fully paid." : "Adjustment saved" } : res;
  }, "Adjustment saved");
}

export async function reversePaymentAction(_: FormState, fd: FormData) {
  return guard("fees:reverse", async (actor) => {
    const res = await reversePayment({ paymentId: text(fd, "paymentId"), reason: text(fd, "reason") }, actor);
    return res.ok ? { ok: true as const, message: `Payment reversed (${res.reversalNumber}). The invoice is open again.` } : res;
  }, "Payment reversed");
}

export async function voidInvoiceAction(_: FormState, fd: FormData) {
  return guard("fees:reverse", async (actor) => voidInvoice({ invoiceId: text(fd, "invoiceId"), reason: text(fd, "reason") }, actor), "Invoice voided");
}
