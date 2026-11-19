import "server-only";
import { staffProfileInputSchema } from "@schoolos/core";
import { AuditEvent, Staff, withOptionalTransaction } from "@schoolos/db";
import type { ClientSession } from "mongoose";
import type { Actor } from "./auth";

export async function getStaffProfile(institutionId: unknown, membershipId: unknown) {
  return (await Staff.findOne({ institutionId, membershipId }).lean()) as unknown as {
    fullName: string;
    phone: string;
    designation?: string;
    subjects?: string;
  } | null;
}

// A staff member may only write their OWN profile (membership comes from the session, not the form).
export async function saveStaffProfile(
  input: unknown,
  actor: Actor,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const parsed = staffProfileInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid profile" };
  const { institutionId, membershipId } = actor;
  await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const staff = await Staff.findOneAndUpdate(
      { institutionId, membershipId },
      { $set: { ...parsed.data, profileCompletedAt: new Date() }, $setOnInsert: { institutionId, membershipId } },
      { new: true, upsert: true, runValidators: true, ...opts },
    );
    await AuditEvent.create(
      [{
        institutionId,
        actorMembershipId: membershipId,
        action: "STAFF_PROFILE_SAVED",
        entityType: "Staff",
        entityId: String(staff._id),
        metadata: {},
      }],
      opts,
    );
  });
  return { ok: true };
}
