import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, rolesFor } from "@schoolos/core";
import { connectDb, Membership } from "@schoolos/db";

// Typed error: server actions return { ok:false } for it; `throw new Response` becomes a generic 500.
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type Actor = {
  membershipId: unknown;
  institutionId: unknown;
  role: string;
};

export function authFailure(error: unknown) {
  if (error instanceof AuthError) {
    return { ok: false as const, error: error.message, status: error.status };
  }
  throw error;
}

export async function getActiveMemberships(userId: string) {
  await connectDb();
  return (await Membership.find({
    clerkUserId: userId,
    active: true,
  }).lean()) as unknown as Array<{
    _id: unknown;
    institutionId: unknown;
    role: string;
  }>;
}

export async function resolveActiveMembership(): Promise<Actor> {
  const { userId } = await auth();
  if (!userId) throw new AuthError(401, "Sign in required");

  const memberships = await getActiveMemberships(userId);
  if (memberships.length === 0) redirect("/onboarding");

  const activeSchoolId = (await cookies()).get("active-school")?.value;
  const membership =
    memberships.find(
      (candidate) => String(candidate.institutionId) === activeSchoolId,
    ) ?? (memberships.length === 1 ? memberships[0] : undefined);
  if (!membership) redirect("/admin/select-school");

  return {
    membershipId: membership._id,
    institutionId: membership.institutionId,
    role: membership.role,
  };
}

// Preferred: check a named permission from the core matrix.
export async function requirePermission(action: string): Promise<Actor> {
  rolesFor(action); // throws on unknown action (typo guard)
  const actor = await resolveActiveMembership();
  if (!can(actor.role, action)) throw new AuthError(403, "Not allowed");
  return actor;
}

// Legacy: explicit role list. Prefer requirePermission.
export async function requireMembership(allowed: string[]): Promise<Actor> {
  const actor = await resolveActiveMembership();
  if (!allowed.includes(actor.role)) throw new AuthError(403, "Not allowed");
  return actor;
}
