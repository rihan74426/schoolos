import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processAllQueues = vi.fn(async () => ({ schools: 1, sent: 2, retried: 0, failed: 0, delivered: 0, skipped: 0 }));
vi.mock("@/server/notifications", () => ({ processAllQueues }));
vi.mock("@schoolos/db", () => ({ connectDb: vi.fn(async () => undefined) }));

const call = async (auth?: string) => {
  const { GET } = await import("@/app/api/cron/notifications/route");
  return GET(new Request("https://app.test/api/cron/notifications", { headers: auth ? { authorization: auth } : {} }));
};

beforeEach(() => processAllQueues.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe("cron route", () => {
  it("refuses to run when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(503);
    expect(processAllQueues).not.toHaveBeenCalled();
  });
  it("rejects missing, wrong and wrong-length credentials", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    for (const header of [undefined, "Bearer wrong-value!", "Bearer s3cret", "s3cret-value", "Bearer s3cret-value-extra"]) {
      expect((await call(header)).status).toBe(401);
    }
    expect(processAllQueues).not.toHaveBeenCalled();
  });
  it("runs the worker for the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 2 });
    expect(processAllQueues).toHaveBeenCalledTimes(1);
  });
});
