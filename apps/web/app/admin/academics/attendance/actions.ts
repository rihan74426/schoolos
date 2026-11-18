"use server";

import { authFailure, requirePermission } from "@/server/auth";
import { submitAttendance } from "@/server/attendance";

export async function submitAttendanceAction(input: unknown) {
  try {
    const actor = await requirePermission("attendance:submit");
    return await submitAttendance(input, actor);
  } catch (error) {
    return authFailure(error);
  }
}
