"use server";

import { revalidatePath } from "next/cache";
import { takaToMinor } from "@schoolos/core";
import { authFailure, requirePermission } from "@/server/auth";
import { updateFeePolicy } from "@/server/fees";
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
