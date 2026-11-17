"use server";

import { requireMembership } from "@/server/auth";
import { submitAttendance } from "@/server/attendance";

const allowedRoles = [
  "OWNER",
  "ADMIN",
  "PRINCIPAL",
  "ACADEMIC_COORDINATOR",
  "TEACHER",
];

export async function submitAttendanceAction(input: unknown) {
  const actor = await requireMembership(allowedRoles);
  return submitAttendance(input, actor);
}
