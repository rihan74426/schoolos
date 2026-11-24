import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { connectDb } from "@schoolos/db";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { previewInvitation } from "@/server/invitations";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";
// The token is in the URL: never leak it through the Referer header.
export const metadata: Metadata = { title: "Join your school", referrer: "no-referrer", robots: { index: false } };

export default async function JoinPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const { token } = params;
  await connectDb();
  const preview = await previewInvitation(token);

  if (!preview) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-4">
        <Card className="mx-auto grid w-full max-w-md gap-3 p-6">
          <h1>Invitation not valid</h1>
          <p className="muted">This link has expired, was already used, or was cancelled. Ask your school to send a new one.</p>
        </Card>
      </main>
    );
  }

  const { userId } = await auth();
  const back = encodeURIComponent(`/join/${token}`);
  const role = preview.role.replace(/_/g, " ").toLowerCase();

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <Card className="mx-auto grid w-full max-w-md gap-3 p-6">
        <p className="eyebrow">YOU ARE INVITED</p>
        <h1>Welcome to {preview.institutionName}</h1>
        <p className="muted">
          {preview.inviteeNote ? `${preview.inviteeNote} — ` : ""}you have been invited to join as <strong>{role}</strong>.
        </p>
        {userId ? (
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full">Join {preview.institutionName}</Button>
          </form>
        ) : (
          <>
            <Link className={buttonVariants({ className: "w-full" })} href={`/sign-up?redirect_url=${back}`}>Create account to join</Link>
            <p className="muted small">Already have an account? <Link className="text-link" href={`/sign-in?redirect_url=${back}`}>Sign in</Link></p>
          </>
        )}
      </Card>
    </main>
  );
}
