import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { connectDb } from "@schoolos/db";
import { previewInvitation } from "@/server/invitations";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";
// The token is in the URL: never leak it through the Referer header.
export const metadata: Metadata = { title: "Join your school", referrer: "no-referrer", robots: { index: false } };

export default async function JoinPage({ params }: { params: { token: string } }) {
  const { token } = params;
  await connectDb();
  const preview = await previewInvitation(token);

  if (!preview) {
    return (
      <main className="landing">
        <section className="panel join-card">
          <h1>Invitation not valid</h1>
          <p className="muted">This link has expired, was already used, or was cancelled. Ask your school to send a new one.</p>
        </section>
      </main>
    );
  }

  const { userId } = await auth();
  const back = encodeURIComponent(`/join/${token}`);
  const role = preview.role.replace(/_/g, " ").toLowerCase();

  return (
    <main className="landing">
      <section className="panel join-card">
        <p className="eyebrow">YOU ARE INVITED</p>
        <h1>Welcome to {preview.institutionName}</h1>
        <p className="muted">
          {preview.inviteeNote ? `${preview.inviteeNote} — ` : ""}you have been invited to join as <strong>{role}</strong>.
        </p>
        {userId ? (
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <button className="button-link" type="submit">Join {preview.institutionName}</button>
          </form>
        ) : (
          <>
            <Link className="button-link" href={`/sign-up?redirect_url=${back}`}>Create account to join</Link>
            <p className="muted small">Already have an account? <Link className="text-link" href={`/sign-in?redirect_url=${back}`}>Sign in</Link></p>
          </>
        )}
      </section>
    </main>
  );
}
