import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isObjectIdOrHexString } from "mongoose";
import type { ClientSession } from "mongoose";
import { invitableRoles } from "@schoolos/core";
import {
  AuditEvent,
  Institution,
  Invitation,
  Membership,
  withOptionalTransaction,
} from "@schoolos/db";
import type { Actor } from "./auth";

const INVITE_TTL_MS = 7 * 24 * 3_600_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
type Fail = { ok: false; error: string };

export async function createInvitation(
  input: { role: string; inviteeNote?: string },
  actor: Actor,
): Promise<Fail | { ok: true; token: string; expiresAt: Date }> {
  if (!invitableRoles(actor.role).includes(input.role)) {
    return { ok: false, error: "You cannot invite that role" };
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const note = input.inviteeNote?.trim().slice(0, 80) || undefined;
  await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const [invite] = await Invitation.create(
      [{
        institutionId: actor.institutionId,
        tokenHash: hashToken(token),
        role: input.role,
        inviteeNote: note,
        expiresAt,
        createdByMembershipId: actor.membershipId,
      }],
      opts,
    );
    await AuditEvent.create(
      [{
        institutionId: actor.institutionId,
        actorMembershipId: actor.membershipId,
        action: "INVITATION_CREATED",
        entityType: "Invitation",
        entityId: String(invite._id),
        metadata: { role: input.role, inviteeNote: note }, // never the token
      }],
      opts,
    );
  });
  return { ok: true, token, expiresAt };
}

export async function listPendingInvitations(institutionId: unknown) {
  return (await Invitation.find({
    institutionId,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()) as unknown as Array<{ _id: unknown; role: string; inviteeNote?: string; expiresAt: Date }>;
}

export async function revokeInvitation(invitationId: string, actor: Actor): Promise<Fail | { ok: true }> {
  if (!isObjectIdOrHexString(invitationId)) return { ok: false, error: "Invalid invitation" };
  const done = await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    const row = await Invitation.findOneAndUpdate(
      { _id: invitationId, institutionId: actor.institutionId, status: "PENDING" },
      { $set: { status: "REVOKED" } },
      { new: true, ...opts },
    );
    if (!row) return false;
    await AuditEvent.create(
      [{
        institutionId: actor.institutionId,
        actorMembershipId: actor.membershipId,
        action: "INVITATION_REVOKED",
        entityType: "Invitation",
        entityId: invitationId,
        metadata: {},
      }],
      opts,
    );
    return true;
  });
  return done ? { ok: true } : { ok: false, error: "Invitation not found" };
}

// Public: what the join page may show before sign-in. Reveals only school name + role.
export async function previewInvitation(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const invite = (await Invitation.findOne({
    tokenHash: hashToken(token),
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  }).lean()) as unknown as { institutionId: unknown; role: string; inviteeNote?: string } | null;
  if (!invite) return null;
  const institution = (await Institution.findOne({ _id: invite.institutionId }).lean()) as unknown as { name: string } | null;
  if (!institution) return null;
  return { institutionName: institution.name, role: invite.role, inviteeNote: invite.inviteeNote };
}

export async function acceptInvitation(
  token: string,
  clerkUserId: string,
): Promise<Fail | { ok: true; institutionId: string; role: string; alreadyMember: boolean }> {
  const invalid: Fail = { ok: false, error: "This invitation is invalid or has expired" };
  if (!TOKEN_RE.test(token)) return invalid;
  const tokenHash = hashToken(token);

  let claimed: { _id: unknown; institutionId: unknown; role: string } | null = null;
  try {
    return await withOptionalTransaction(async (txn: ClientSession | null) => {
      const opts = txn ? { session: txn } : {};
      // Atomic single-use claim: only one request can flip PENDING -> ACCEPTED.
      claimed = (await Invitation.findOneAndUpdate(
        { tokenHash, status: "PENDING", expiresAt: { $gt: new Date() } },
        { $set: { status: "ACCEPTED", acceptedByClerkUserId: clerkUserId, acceptedAt: new Date() } },
        opts,
      )) as unknown as typeof claimed;
      if (!claimed) return invalid;

      const { institutionId, role } = claimed;
      const existing = (await Membership.findOne({ institutionId, clerkUserId }, null, opts).lean()) as unknown as
        | { _id: unknown; active: boolean }
        | null;
      let membershipId: unknown;
      let alreadyMember = false;
      if (existing?.active) {
        membershipId = existing._id; // never change an existing active member's role via a link
        alreadyMember = true;
      } else if (existing) {
        await Membership.updateOne({ _id: existing._id, institutionId }, { $set: { active: true, role } }, opts);
        membershipId = existing._id;
      } else {
        const [created] = await Membership.create([{ institutionId, clerkUserId, role, active: true }], opts);
        membershipId = created._id;
      }
      await AuditEvent.create(
        [{
          institutionId,
          actorMembershipId: membershipId,
          action: "INVITATION_ACCEPTED",
          entityType: "Invitation",
          entityId: String(claimed._id),
          metadata: { role, alreadyMember },
        }],
        opts,
      );
      return { ok: true as const, institutionId: String(institutionId), role, alreadyMember };
    });
  } catch (error) {
    // Standalone Mongo has no transaction: release the claim so the link is not burned by a failure.
    if (claimed) {
      await Invitation.findOneAndUpdate(
        { tokenHash, status: "ACCEPTED", acceptedByClerkUserId: clerkUserId },
        { $set: { status: "PENDING" }, $unset: { acceptedByClerkUserId: 1, acceptedAt: 1 } },
      ).catch(() => null);
    }
    throw error;
  }
}
