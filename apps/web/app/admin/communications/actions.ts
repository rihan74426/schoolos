"use server";

import { revalidatePath } from "next/cache";
import { authFailure, requirePermission } from "@/server/auth";
import { saveChannel, testChannel } from "@/server/messaging";

export type FormState = { ok: boolean; message: string } | null;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

export async function saveChannelAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await requirePermission("settings:write");
    const result = await saveChannel(
      { kind: "SMS", provider: text(fd, "provider"), senderId: text(fd, "senderId"), apiKey: text(fd, "apiKey") || undefined },
      actor,
    );
    if (!result.ok) return { ok: false, message: result.error };
    revalidatePath("/admin/communications");
    return { ok: true, message: "SMS channel saved. Send a test message to confirm it works." };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}

export async function testChannelAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await requirePermission("settings:write");
    const result = await testChannel(text(fd, "phone"), actor);
    revalidatePath("/admin/communications");
    return result.ok ? { ok: true, message: result.detail } : { ok: false, message: result.error };
  } catch (error) {
    return { ok: false, message: authFailure(error).error };
  }
}
