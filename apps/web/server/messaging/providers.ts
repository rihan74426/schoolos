import "server-only";

export type SendResult = { ok: true; providerId: string } | { ok: false; error: string; retryable: boolean };
export type DeliveryState = "PENDING" | "DELIVERED" | "FAILED" | "UNKNOWN";
export type StatusResult = { ok: true; state: DeliveryState } | { ok: false; error: string };
export type BalanceResult = { ok: true; balance: string } | { ok: false; error: string };

export interface SmsProvider {
  send(input: { to: string; text: string }): Promise<SendResult>;
  status(providerId: string): Promise<StatusResult>;
  balance(): Promise<BalanceResult>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;

/** Test double. Numbers ending 000 fail permanently, 999 fail retryably; everything else succeeds. */
export function createFakeProvider(): SmsProvider {
  return {
    async send({ to }) {
      if (to.endsWith("000")) return { ok: false, error: "Fake: invalid number", retryable: false };
      if (to.endsWith("999")) return { ok: false, error: "Fake: temporary failure", retryable: true };
      return { ok: true, providerId: `fake-${Math.random().toString(36).slice(2, 10)}` };
    },
    async status() {
      return { ok: true, state: "DELIVERED" };
    },
    async balance() {
      return { ok: true, balance: "unlimited (fake)" };
    },
  };
}

// Non-retryable sms.net.bd codes (see https://sms.bd/api): bad request/auth range and send errors
// such as 413 invalid sender id, 417 insufficient balance.
const SMS_NET_BD_BASE = "https://api.sms.net.bd";

function mapState(raw: unknown): DeliveryState {
  const value = String(raw ?? "");
  if (/deliver/i.test(value)) return "DELIVERED";
  if (/fail|reject|undeliver|expire|invalid/i.test(value)) return "FAILED";
  if (/pend|queue|sent|submit|process/i.test(value)) return "PENDING";
  return "UNKNOWN";
}

export function createSmsNetBdProvider(creds: { apiKey: string; senderId?: string }, fetchImpl: Fetch = fetch): SmsProvider {
  async function call(path: string, body: Record<string, unknown>) {
    // Key goes in the POST body, never in a URL (URLs end up in logs).
    const res = await fetchImpl(`${SMS_NET_BD_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_key: creds.apiKey, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { error?: number; msg?: string; data?: Record<string, unknown> } | null;
    return { status: res.status, json };
  }

  return {
    async send({ to, text }) {
      try {
        const { status, json } = await call("/sendsms", {
          msg: text,
          to: to.replace(/^\+/, ""),
          ...(creds.senderId ? { sender_id: creds.senderId } : {}),
        });
        if (json && json.error === 0) {
          const id = json.data?.request_id;
          return id != null ? { ok: true, providerId: String(id) } : { ok: false, error: "Provider accepted the request but returned no id", retryable: false };
        }
        const code = json?.error ?? status;
        // 5xx / unknown shapes may succeed on retry; auth, sender and balance errors will not.
        const retryable = status >= 500 || (json == null && status !== 400);
        return { ok: false, error: `sms.net.bd ${code}: ${json?.msg ?? "request failed"}`, retryable };
      } catch (error) {
        return { ok: false, error: `sms.net.bd unreachable: ${(error as Error).message}`, retryable: true };
      }
    },
    async status(providerId) {
      try {
        const { json } = await call(`/report/request/${encodeURIComponent(providerId)}/`, {});
        if (!json || json.error !== 0) return { ok: false, error: json?.msg ?? "Status lookup failed" };
        const data = json.data ?? {};
        const recipients = Array.isArray(data.recipients) ? (data.recipients as Array<{ status?: unknown }>) : [];
        return { ok: true, state: mapState(recipients[0]?.status ?? data.request_status) };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
    async balance() {
      try {
        const { json } = await call("/user/balance/", {});
        if (!json || json.error !== 0) return { ok: false, error: json?.msg ?? "Balance lookup failed" };
        return { ok: true, balance: String(json.data?.balance ?? "unknown") };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  };
}

export function createProvider(provider: string, creds: { apiKey?: string; senderId?: string }, fetchImpl?: Fetch): SmsProvider | null {
  if (provider === "FAKE") return createFakeProvider();
  if (provider === "SMS_NET_BD" && creds.apiKey) return createSmsNetBdProvider({ apiKey: creds.apiKey, senderId: creds.senderId }, fetchImpl);
  return null;
}
