import { auth } from "@clerk/nextjs/server";
import { connectDb, Membership } from "@schoolos/db";

export async function requireMembership(allowed: string[]) {
  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  await connectDb();
  const membership = (await Membership.findOne({
    clerkUserId: userId,
    active: true,
  }).lean()) as { _id: unknown; institutionId: unknown; role: string } | null;

  if (!membership || !allowed.includes(membership.role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    membershipId: membership._id,
    institutionId: membership.institutionId,
    role: membership.role as string,
  };
}
