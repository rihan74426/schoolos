"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isObjectIdOrHexString } from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb, Institution, Membership } from "@schoolos/db";

export async function setActiveSchoolAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const institutionId = String(formData.get("institutionId") ?? "");
  if (!isObjectIdOrHexString(institutionId)) redirect("/admin/select-school");
  await connectDb();
  const membership = await Membership.findOne({
    clerkUserId: userId,
    institutionId,
    active: true,
  }).lean();
  if (!membership) redirect("/admin/select-school");

  const institution = (await Institution.findById(institutionId).lean()) as {
    defaultLocale?: string;
  } | null;
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  cookieStore.set("active-school", institutionId, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set("schoolos-locale", institution?.defaultLocale ?? "en", {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin/dashboard");
}
