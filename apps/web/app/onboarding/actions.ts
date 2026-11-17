"use server";

import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb, Institution, Membership } from "@schoolos/db";

const INITIAL_BOOTSTRAP_KEY = "initial-owner";
const supportedLocales = new Set(["en", "bn", "ar"]);
export type OnboardingState = { error?: string } | null;

export async function createFirstInstitutionAction(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { userId } = await auth();
  if (!userId) throw new Response("Unauthorized", { status: 401 });

  const name = String(formData.get("name") ?? "").trim();
  const localeInput = String(formData.get("locale") ?? "en");
  const defaultLocale = supportedLocales.has(localeInput) ? localeInput : "en";
  if (name.length < 2 || name.length > 120) {
    return { error: "Institution name must be between 2 and 120 characters." };
  }

  await connectDb();
  const memberships = await Membership.find({
    clerkUserId: userId,
    active: true,
  }).lean();
  if (memberships.length > 0) redirect("/admin/dashboard");
  if (await Institution.exists({})) {
    return {
      error:
        "Initial setup is already complete. Ask an institution owner for an invitation.",
    };
  }

  const slugBase =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "school";
  const slug = `${slugBase}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
  const institutionData = {
    name,
    slug,
    defaultLocale,
    bootstrapKey: INITIAL_BOOTSTRAP_KEY,
  };
  let institutionId: mongoose.Types.ObjectId;
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
  const supportsTransactions = Boolean(
    hello?.setName || hello?.msg === "isdbgrid",
  );

  if (supportsTransactions) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [institution] = await Institution.create([institutionData], {
          session,
        });
        const [membership] = await Membership.create(
          [
            {
              institutionId: institution._id,
              clerkUserId: userId,
              role: "OWNER",
              active: true,
            },
          ],
          { session },
        );
        institutionId = institution._id;
        void membership;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return { error: "Initial setup was completed by another user." };
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    const [institution] = await Institution.create([institutionData]);
    institutionId = institution._id;
    try {
      await Membership.create({
        institutionId,
        clerkUserId: userId,
        role: "OWNER",
        active: true,
      });
    } catch (error) {
      await Institution.deleteOne({
        _id: institutionId,
        bootstrapKey: INITIAL_BOOTSTRAP_KEY,
      });
      if ((error as { code?: number }).code === 11000) {
        return { error: "Initial setup was completed by another user." };
      }
      throw error;
    }
  }

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  cookieStore.set("active-school", institutionId!.toString(), cookieOptions);
  cookieStore.set("schoolos-locale", defaultLocale, cookieOptions);
  redirect("/admin/dashboard");
}
