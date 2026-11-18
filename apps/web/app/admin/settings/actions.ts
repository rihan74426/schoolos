"use server";

import { authFailure, requirePermission } from "@/server/auth";
import { saveGradingScheme, updateInstitutionPolicy } from "@/server/policy";

export async function updatePolicyAction(input: unknown, expectedVersion: number) {
  try {
    const actor = await requirePermission("policy:write");
    return await updateInstitutionPolicy(input, expectedVersion, actor);
  } catch (error) {
    return authFailure(error);
  }
}

export async function saveGradingSchemeAction(input: unknown, makeDefault = false) {
  try {
    const actor = await requirePermission("policy:write");
    return await saveGradingScheme(input, { makeDefault }, actor);
  } catch (error) {
    return authFailure(error);
  }
}
