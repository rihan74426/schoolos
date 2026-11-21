import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@schoolos/db";
import { processAllQueues } from "@/server/notifications";

export const dynamic = "force-dynamic";

// Called by a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(new Uint8Array(given), new Uint8Array(expected))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  return Response.json(await processAllQueues());
}
