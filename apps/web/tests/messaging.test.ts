import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditEvent, MessagingChannel } from "@schoolos/db";
import { getChannelSummary, loadProvider, saveChannel, testChannel } from "@/server/messaging";
import { decryptSecret } from "@/server/messaging/crypto";

let mongo: MongoMemoryServer;
const oid = () => new mongoose.Types.ObjectId();
const schoolA = oid();
const schoolB = oid();
const as = (institutionId = schoolA) => ({ membershipId: oid(), institutionId, role: "OWNER" });
const KEY = "live-key-ABCD1234";

beforeAll(async () => {
  process.env.MESSAGING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([MessagingChannel, AuditEvent].map((m) => m.syncIndexes()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("saveChannel", () => {
  it("encrypts the key, hides it from every read path, and audits without the secret", async () => {
    expect(await saveChannel({ kind: "SMS", provider: "SMS_NET_BD", senderId: "NurSchool", apiKey: KEY }, as())).toEqual({ ok: true });

    const summary = await getChannelSummary(schoolA);
    expect(summary).toMatchObject({ provider: "SMS_NET_BD", senderId: "NurSchool", keyHint: "1234", active: true });
    expect(JSON.stringify(summary)).not.toContain(KEY);

    const plain = (await MessagingChannel.findOne({ institutionId: schoolA, kind: "SMS" }).lean()) as Record<string, unknown>;
    expect(plain.credentialsEnc).toBeUndefined(); // select:false

    const raw = (await MessagingChannel.collection.findOne({ institutionId: schoolA })) as unknown as { credentialsEnc: string };
    expect(raw.credentialsEnc).not.toContain(KEY);
    expect(decryptSecret(raw.credentialsEnc, String(schoolA))).toBe(KEY);
    expect(() => decryptSecret(raw.credentialsEnc, String(schoolB))).toThrow();

    const audit = await AuditEvent.find({ institutionId: schoolA, action: "MESSAGING_CHANNEL_SAVED" }).lean();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(KEY);
  });

  it("keeps the stored key when edited without one, and replaces it when given", async () => {
    expect(await saveChannel({ kind: "SMS", provider: "SMS_NET_BD", senderId: "NewName" }, as())).toEqual({ ok: true });
    expect(await getChannelSummary(schoolA)).toMatchObject({ senderId: "NewName", keyHint: "1234" });
    expect(await loadProvider(schoolA)).not.toBeNull();
    await saveChannel({ kind: "SMS", provider: "SMS_NET_BD", apiKey: "another-key-9876" }, as());
    expect(await getChannelSummary(schoolA)).toMatchObject({ keyHint: "9876" });
    expect(await MessagingChannel.countDocuments({ institutionId: schoolA })).toBe(1);
  });

  it("requires a key for a real provider and validates input", async () => {
    expect(await saveChannel({ kind: "SMS", provider: "SMS_NET_BD" }, as(schoolB))).toMatchObject({ ok: false, error: "Enter the provider API key" });
    expect(await saveChannel({ kind: "SMS", provider: "NOPE" }, as(schoolB))).toMatchObject({ ok: false });
    expect(await saveChannel({ kind: "SMS", provider: "SMS_NET_BD", apiKey: "x" }, as(schoolB))).toMatchObject({ ok: false });
  });

  it("keeps schools isolated", async () => {
    expect(await getChannelSummary(schoolB)).toBeNull();
    expect(await loadProvider(schoolB)).toBeNull();
  });

  it("refuses the fake provider in production unless explicitly allowed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await saveChannel({ kind: "SMS", provider: "FAKE" }, as(schoolB))).toMatchObject({ ok: false });
    vi.stubEnv("ALLOW_FAKE_SMS", "true");
    expect(await saveChannel({ kind: "SMS", provider: "FAKE" }, as(schoolB))).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });

  it("treats an undecryptable key as not configured", async () => {
    const saved = process.env.MESSAGING_ENCRYPTION_KEY;
    process.env.MESSAGING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(await loadProvider(schoolA)).toBeNull();
    process.env.MESSAGING_ENCRYPTION_KEY = saved;
  });
});

describe("testChannel", () => {
  it("records a pass for the fake provider and a failure for a bad number", async () => {
    const owner = as(schoolB);
    await saveChannel({ kind: "SMS", provider: "FAKE" }, owner);
    expect(await testChannel("01711111111", owner)).toMatchObject({ ok: true });
    expect((await getChannelSummary(schoolB))?.lastTest?.ok).toBe(true);
    expect(await testChannel("12345", owner)).toMatchObject({ ok: false, error: "Enter a valid Bangladesh mobile number" });
    expect(await testChannel("01711111000", owner)).toMatchObject({ ok: false });
    expect((await getChannelSummary(schoolB))?.lastTest?.ok).toBe(false);
  });
  it("needs a saved channel", async () => {
    expect(await testChannel("01711111111", as(oid()))).toMatchObject({ ok: false, error: "Save an SMS channel first" });
  });
});
