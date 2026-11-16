import { auth } from '@clerk/nextjs/server';
import { connectDb, Membership } from '@schoolos/db';

export async function requireMembership(allowed: string[]) {
  const { userId } = auth();
  if (!userId) throw new Response('Unauthorized', { status: 401 });

  await connectDb();
  const membership = await Membership.findOne({ clerkUserId: userId, active: true });
  if (!membership || !allowed.includes(membership.role)) {
    throw new Response('Forbidden', { status: 403 });
  }

  return {
    membershipId: membership._id,
    institutionId: membership.institutionId,
    role: membership.role as string,
  };
}
