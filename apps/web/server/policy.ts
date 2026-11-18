import "server-only";
import type { ClientSession } from "mongoose";
import {
  gradingSchemeSchema,
  institutionPolicySchema,
} from "@schoolos/core";
import {
  AuditEvent,
  GradingScheme,
  InstitutionPolicy,
  withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";

type Fail = { ok: false; error: string };

export async function getInstitutionPolicy(institutionId: unknown) {
  return (await InstitutionPolicy.findOne({ institutionId }).lean()) as {
    version: number;
    policy: unknown;
  } | null;
}

export async function updateInstitutionPolicy(
  input: unknown,
  expectedVersion: number,
  actor: Actor,
): Promise<Fail | { ok: true; version: number }> {
  const parsed = institutionPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid policy" };
  const { institutionId } = actor;

  const scheme = await GradingScheme.exists({
    institutionId,
    key: parsed.data.gradingSchemeKey,
    status: "ACTIVE",
  });
  if (!scheme) return { ok: false, error: "Unknown grading scheme" };

  const before = await getInstitutionPolicy(institutionId);
  const saved = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const updated = await InstitutionPolicy.findOneAndUpdate(
      { institutionId, version: expectedVersion },
      {
        $set: { policy: parsed.data, updatedByMembershipId: actor.membershipId },
        $inc: { version: 1 },
      },
      { new: true, ...opts },
    );
    if (!updated) return null;
    await AuditEvent.create(
      [
        {
          institutionId,
          actorMembershipId: actor.membershipId,
          action: "POLICY_UPDATED",
          entityType: "InstitutionPolicy",
          entityId: String(updated._id),
          metadata: { fromVersion: expectedVersion, before: before?.policy, after: parsed.data },
        },
      ],
      opts,
    );
    return updated;
  });
  if (!saved) return { ok: false, error: "Policy changed elsewhere. Reload and retry." };
  return { ok: true, version: saved.version };
}

export async function saveGradingScheme(
  input: unknown,
  options: { makeDefault?: boolean },
  actor: Actor,
): Promise<Fail | { ok: true; key: string }> {
  const parsed = gradingSchemeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid grading scheme" };
  const { institutionId } = actor;
  const scheme = parsed.data;

  await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    if (options.makeDefault) {
      await GradingScheme.updateMany(
        { institutionId, isDefault: true },
        { $set: { isDefault: false } },
        opts,
      );
    }
    const saved = await GradingScheme.findOneAndUpdate(
      { institutionId, key: scheme.key },
      {
        $set: { ...scheme, status: "ACTIVE", ...(options.makeDefault ? { isDefault: true } : {}) },
        $setOnInsert: { institutionId },
      },
      { new: true, upsert: true, runValidators: true, ...opts },
    );
    await AuditEvent.create(
      [
        {
          institutionId,
          actorMembershipId: actor.membershipId,
          action: "GRADING_SCHEME_SAVED",
          entityType: "GradingScheme",
          entityId: String(saved._id),
          metadata: { key: scheme.key, makeDefault: Boolean(options.makeDefault) },
        },
      ],
      opts,
    );
  });
  return { ok: true, key: scheme.key };
}
