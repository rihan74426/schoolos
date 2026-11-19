"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authFailure, resolveActiveMembership } from "@/server/auth";
import { saveStaffProfile } from "@/server/staff";

export type ProfileState = { ok: boolean; message: string } | null;

export async function saveProfileAction(_: ProfileState, fd: FormData): Promise<ProfileState> {
  try {
    const actor = await resolveActiveMembership();
    const result = await saveStaffProfile(
      {
        fullName: String(fd.get("fullName") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        designation: String(fd.get("designation") ?? ""),
        subjects: String(fd.get("subjects") ?? ""),
      },
      actor,
    );
    if (!result.ok) return { ok: false, message: result.error };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/dashboard");
}
