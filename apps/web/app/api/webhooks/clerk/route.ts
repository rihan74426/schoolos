import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { connectDb, Membership } from '@schoolos/db';

export async function POST(request: Request) {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) return Response.json({ error: 'Webhook is not configured' }, { status: 500 });

  const headerList = headers();
  const svixId = headerList.get('svix-id');
  const svixTimestamp = headerList.get('svix-timestamp');
  const svixSignature = headerList.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  let event: { type: string; data: { id?: string } };
  try {
    const webhook = new Webhook(signingSecret);
    event = webhook.verify(await request.text(), {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  await connectDb();
  if (event.type === 'user.deleted' && event.data.id) {
    await Membership.updateMany({ clerkUserId: event.data.id }, { $set: { active: false } });
  }

  // Membership creation is intentionally invite/admin controlled, not driven by arbitrary profile metadata.
  return Response.json({ received: true });
}
