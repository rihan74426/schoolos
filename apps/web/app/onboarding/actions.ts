"use server";

import { randomBytes } from "node:crypto";
import type { ClientSession, Types } from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildInitialPolicy,
  gradingPresets,
  policyPresets,
} from "@schoolos/core";
import {
  connectDb,
  GradingScheme,
  Institution,
  InstitutionPolicy,
  Membership,
  supportsTransactions,
  withOptionalTransaction,
} from "@schoolos/db";

const INITIAL_BOOTSTRAP_KEY = "initial-owner";
const supportedLocales = new Set(["en", "bn", "ar"]);
export type OnboardingState = { error?: string } | null;

export async function createFirstInstitutionAction(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const presetInput = String(formData.get("preset") ?? "bd-school");
  const preset = Object.hasOwn(policyPresets, presetInput)
    ? presetInput
    : "bd-school";
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
  const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;
  const institutionData = {
    name,
    slug,
    defaultLocale,
    bootstrapKey: INITIAL_BOOTSTRAP_KEY,
  };
  const policy = buildInitialPolicy(preset);
  const scheme =
    gradingPresets[policy.gradingSchemeKey as keyof typeof gradingPresets];
  const seedDocs = (institutionId: Types.ObjectId, membershipId?: unknown) => ({
    policy: {
      institutionId,
      policy,
      sourcePreset: preset,
      updatedByMembershipId: membershipId,
    },
    scheme: {
      ...scheme,
      institutionId,
      sourcePreset: scheme.key,
      isDefault: true,
    },
  });
  let institutionId: Types.ObjectId;

  if (await supportsTransactions()) {
    try {
      await withOptionalTransaction(async (session: ClientSession | null) => {
        if (!session) throw new Error("Expected a transaction session");
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
        const seed = seedDocs(institution._id, membership._id);
        await InstitutionPolicy.create([seed.policy], { session });
        await GradingScheme.create([seed.scheme], { session });
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return { error: "Initial setup was completed by another user." };
      }
      throw error;
    }
  } else {
    const [institution] = await Institution.create([institutionData]);
    institutionId = institution._id;
    try {
      const membership = await Membership.create({
        institutionId,
        clerkUserId: userId,
        role: "OWNER",
        active: true,
      });
      const seed = seedDocs(institutionId, membership._id);
      await InstitutionPolicy.create(seed.policy);
      await GradingScheme.create(seed.scheme);
    } catch (error) {
      await Promise.all([
        InstitutionPolicy.deleteMany({ institutionId }),
        GradingScheme.deleteMany({ institutionId }),
        Membership.deleteMany({
          institutionId,
          clerkUserId: userId,
          active: true,
        }),
      ]);
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
