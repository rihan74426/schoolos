import "server-only";
import { feePolicySchema } from "@schoolos/core";
import { getInstitutionPolicy, updateInstitutionPolicy } from "./policy";
import type { Actor } from "./auth";

type Fail = { ok: false; error: string };

/** Fee rules (late fee, scholarship cap) edited on their own so leaders without full policy access can set them. */
export async function updateFeePolicy(input: unknown, expectedVersion: number, actor: Actor): Promise<Fail | { ok: true; version: number }> {
  const parsed = feePolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fee rules" };
  const current = await getInstitutionPolicy(actor.institutionId);
  if (!current) return { ok: false, error: "Policy not found" };
  // Same optimistic version + before/after audit as every other policy edit.
  return updateInstitutionPolicy({ ...(current.policy as Record<string, unknown>), fees: parsed.data }, expectedVersion, actor);
}
