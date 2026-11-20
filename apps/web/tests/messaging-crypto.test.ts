import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/server/messaging/crypto";
import { createFakeProvider, createProvider, createSmsNetBdProvider } from "@/server/messaging/providers";

beforeAll(() => {
  process.env.MESSAGING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("credential encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const token = encryptSecret("super-secret-key-1234", "school-a");
    expect(token).not.toContain("super-secret");
    expect(token.startsWith("v1.")).toBe(true);
    expect(decryptSecret(token, "school-a")).toBe("super-secret-key-1234");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same-secret-value", "a")).not.toBe(encryptSecret("same-secret-value", "a"));
  });
  it("is bound to the institution and detects tampering", () => {
    const token = encryptSecret("super-secret-key-1234", "school-a");
    expect(() => decryptSecret(token, "school-b")).toThrow();
    const [v, iv, tag, data] = token.split(".");
    expect(() => decryptSecret([v, iv, tag, data.slice(0, -2) + "AA"].join("."), "school-a")).toThrow();
    expect(() => decryptSecret("garbage", "school-a")).toThrow();
  });
  it("refuses a missing or wrongly sized master key", () => {
    const saved = process.env.MESSAGING_ENCRYPTION_KEY;
    process.env.MESSAGING_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptSecret("x", "a")).toThrow(/32 bytes/);
    delete process.env.MESSAGING_ENCRYPTION_KEY;
    expect(() => encryptSecret("x", "a")).toThrow(/not set/);
    process.env.MESSAGING_ENCRYPTION_KEY = saved;
  });
});

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("sms.net.bd adapter", () => {
  const creds = { apiKey: "key-12345678", senderId: "NurSchool" };

  it("sends with the key in the body, digits-only number, and returns the request id", async () => {
    const f = reply(200, { error: 0, msg: "Request successfully submitted", data: { request_id: 4242 } });
    const res = await createSmsNetBdProvider(creds, f).send({ to: "+8801711111111", text: "hi" });
    expect(res).toEqual({ ok: true, providerId: "4242" });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sms.net.bd/sendsms");
    expect(url).not.toContain("key-12345678");
    expect(JSON.parse(String(init.body))).toMatchObject({ api_key: "key-12345678", to: "8801711111111", msg: "hi", sender_id: "NurSchool" });
  });
  it("treats balance and sender errors as permanent", async () => {
    const res = await createSmsNetBdProvider(creds, reply(200, { error: 417, msg: "Insufficient balance" })).send({ to: "+8801711111111", text: "hi" });
    expect(res).toMatchObject({ ok: false, retryable: false });
    expect((res as { error: string }).error).toContain("417");
  });
  it("treats 5xx and network failures as retryable", async () => {
    expect(await createSmsNetBdProvider(creds, reply(503, { error: 500 })).send({ to: "+8801711111111", text: "hi" })).toMatchObject({ ok: false, retryable: true });
    const boom = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect(await createSmsNetBdProvider(creds, boom).send({ to: "+8801711111111", text: "hi" })).toMatchObject({ ok: false, retryable: true });
  });
  it("fails safely on a success reply without an id", async () => {
    expect(await createSmsNetBdProvider(creds, reply(200, { error: 0, data: {} })).send({ to: "+8801711111111", text: "hi" })).toMatchObject({ ok: false, retryable: false });
  });
  it("maps delivery states and reads balance", async () => {
    const state = async (raw: string) => (await createSmsNetBdProvider(creds, reply(200, { error: 0, data: { recipients: [{ status: raw }] } })).status("1"));
    expect(await state("Delivered")).toEqual({ ok: true, state: "DELIVERED" });
    expect(await state("Failed")).toEqual({ ok: true, state: "FAILED" });
    expect(await state("Pending")).toEqual({ ok: true, state: "PENDING" });
    expect(await state("???")).toEqual({ ok: true, state: "UNKNOWN" });
    expect(await createSmsNetBdProvider(creds, reply(200, { error: 0, data: { balance: "120.50" } })).balance()).toEqual({ ok: true, balance: "120.50" });
  });
});

describe("provider factory and fake", () => {
  it("builds known providers and rejects incomplete ones", () => {
    expect(createProvider("FAKE", {})).not.toBeNull();
    expect(createProvider("SMS_NET_BD", {})).toBeNull();
    expect(createProvider("NOPE", { apiKey: "x" })).toBeNull();
  });
  it("fake provider fails by number suffix", async () => {
    const fake = createFakeProvider();
    expect(await fake.send({ to: "+8801711111000", text: "x" })).toMatchObject({ ok: false, retryable: false });
    expect(await fake.send({ to: "+8801711111999", text: "x" })).toMatchObject({ ok: false, retryable: true });
    expect((await fake.send({ to: "+8801711111111", text: "x" })).ok).toBe(true);
  });
});
