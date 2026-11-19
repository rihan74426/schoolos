"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_PROFILE_ROLES } from "@schoolos/core";
import { connectDb, Institution } from "@schoolos/db";
import { acceptInvitation } from "@/server/invitations";

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/join/${token}`)}`);

  await connectDb();
  const result = await acceptInvitation(token, userId);
  if (!result.ok) redirect(`/join/${encodeURIComponent(token)}`); // page shows "invalid or expired"

  const institution = (await Institution.findOne({ _id: result.institutionId }).lean()) as unknown as { defaultLocale?: string } | null;
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  cookieStore.set("active-school", result.institutionId, options);
  cookieStore.set("schoolos-locale", institution?.defaultLocale ?? "en", options);
  redirect(STAFF_PROFILE_ROLES.includes(result.role) ? "/admin/welcome" : "/admin/dashboard");
}
