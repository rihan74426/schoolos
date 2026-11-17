import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb, Membership } from "@schoolos/db";

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

export async function requireMembership(allowed: string[]) {
  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const memberships = await getActiveMemberships(userId);
  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const activeSchoolId = (await cookies()).get("active-school")?.value;
  const membership =
    memberships.find(
      (candidate) => String(candidate.institutionId) === activeSchoolId,
    ) ?? (memberships.length === 1 ? memberships[0] : undefined);

  if (!membership) {
    redirect("/admin/select-school");
  }

  if (!allowed.includes(membership.role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    membershipId: membership._id,
    institutionId: membership.institutionId,
    role: membership.role as string,
  };
}
