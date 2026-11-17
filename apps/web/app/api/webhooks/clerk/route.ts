import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { connectDb, Membership } from "@schoolos/db";

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }

  if (event.type === "user.deleted" && event.data.id) {
    await connectDb();
    await Membership.updateMany(
      { clerkUserId: event.data.id },
      { $set: { active: false } },
    );
  }

  return new Response("OK", { status: 200 });
}
