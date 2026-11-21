import "server-only";
import type { ClientSession } from "mongoose";
import { messagingChannelInputSchema, normalizeBdPhone } from "@schoolos/core";
import { AuditEvent, MessagingChannel, withOptionalTransaction } from "@schoolos/db";
import type { Actor } from "./auth";
import { decryptSecret, encryptSecret } from "./messaging/crypto";
import { createProvider } from "./messaging/providers";
import type { SmsProvider } from "./messaging/providers";

type Fail = { ok: false; error: string };
const fakeAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_FAKE_SMS === "true";

type ChannelDoc = {
  _id: unknown;
  provider: string;
  senderId?: string;
  keyHint?: string;
  active: boolean;
  credentialsEnc?: string;
  lastTest?: { at?: Date; ok?: boolean; detail?: string };
};

/** Display-safe view. Never includes credentials. */
export async function getChannelSummary(institutionId: unknown) {
  const channel = (await MessagingChannel.findOne({ institutionId, kind: "SMS" }).lean()) as ChannelDoc | null;
  if (!channel) return null;
  return {
    provider: channel.provider,
    senderId: channel.senderId ?? "",
    active: channel.active,
    keyHint: channel.keyHint ?? "",
    lastTest: channel.lastTest ? { at: channel.lastTest.at?.toISOString(), ok: channel.lastTest.ok, detail: channel.lastTest.detail } : null,
  };
}

export async function saveChannel(input: unknown, actor: Actor): Promise<{ ok: true } | Fail> {
  const parsed = messagingChannelInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid channel" };
  const { provider, senderId, apiKey } = parsed.data;
  if (provider === "FAKE" && !fakeAllowed()) return { ok: false, error: "The fake provider is for testing only" };

  const { institutionId } = actor;
  const existing = (await MessagingChannel.findOne({ institutionId, kind: "SMS" }).select("+credentialsEnc").lean()) as ChannelDoc | null;
  if (provider !== "FAKE" && !apiKey && !(existing?.credentialsEnc && existing.provider === provider)) {
    return { ok: false, error: "Enter the provider API key" };
  }

  const set: Record<string, unknown> = { provider, senderId, active: true, updatedByMembershipId: actor.membershipId };
  const unset: Record<string, 1> = {};
  if (provider === "FAKE") {
    Object.assign(set, { keyHint: "" });
    unset.credentialsEnc = 1;
  } else if (apiKey) {
    Object.assign(set, { credentialsEnc: encryptSecret(apiKey, String(institutionId)), keyHint: apiKey.slice(-4) });
  }
  // Switching provider invalidates any previous test result.
  if (!existing || existing.provider !== provider) unset.lastTest = 1;

  await withOptionalTransaction(async (txn: ClientSession | null) => {
    const opts = txn ? { session: txn } : {};
    await MessagingChannel.updateOne(
      { institutionId, kind: "SMS" },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $setOnInsert: { institutionId, kind: "SMS" } },
      { upsert: true, runValidators: true, ...opts },
    );
    await AuditEvent.create(
      [{
        institutionId,
        actorMembershipId: actor.membershipId,
        action: "MESSAGING_CHANNEL_SAVED",
        entityType: "MessagingChannel",
        entityId: "SMS",
        // Never the key itself.
        metadata: { before: existing ? { provider: existing.provider, senderId: existing.senderId ?? "" } : null, after: { provider, senderId }, keyChanged: Boolean(apiKey) },
      }],
      opts,
    );
  });
  return { ok: true };
}

/** Internal: decrypted provider for sending. Null when no active, usable channel. */
export async function loadProvider(institutionId: unknown): Promise<SmsProvider | null> {
  const channel = (await MessagingChannel.findOne({ institutionId, kind: "SMS", active: true }).select("+credentialsEnc").lean()) as ChannelDoc | null;
  if (!channel) return null;
  if (channel.provider === "FAKE" && !fakeAllowed()) return null;
  let apiKey: string | undefined;
  if (channel.credentialsEnc) {
    try {
      apiKey = decryptSecret(channel.credentialsEnc, String(institutionId));
    } catch {
      return null; // wrong master key or tampered value: treat as not configured
    }
  }
  return createProvider(channel.provider, { apiKey, senderId: channel.senderId });
}

/** Balance check plus one SMS to the founder's own number. Records the outcome. */
export async function testChannel(toPhone: string, actor: Actor): Promise<{ ok: true; detail: string } | Fail> {
  const to = normalizeBdPhone(toPhone);
  if (!to) return { ok: false, error: "Enter a valid Bangladesh mobile number" };
  const provider = await loadProvider(actor.institutionId);
  if (!provider) return { ok: false, error: "Save an SMS channel first" };

  const balance = await provider.balance();
  const sent = balance.ok ? await provider.send({ to, text: "SchoolOS test message. Your SMS channel works." }) : null;
  const ok = Boolean(balance.ok && sent?.ok);
  const detail = !balance.ok ? `Balance check failed: ${balance.error}` : sent && !sent.ok ? `Send failed: ${sent.error}` : `Balance ${balance.balance}; test SMS sent`;

  await MessagingChannel.updateOne({ institutionId: actor.institutionId, kind: "SMS" }, { $set: { lastTest: { at: new Date(), ok, detail: detail.slice(0, 300) } } });
  await AuditEvent.create([{ institutionId: actor.institutionId, actorMembershipId: actor.membershipId, action: "MESSAGING_CHANNEL_TESTED", entityType: "MessagingChannel", entityId: "SMS", metadata: { ok } }]);
  return ok ? { ok: true, detail } : { ok: false, error: detail };
}
