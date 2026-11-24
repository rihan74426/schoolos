import "server-only";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Who may create the very first institution. In production BOOTSTRAP_EMAIL (comma separated) is required, so a
 * stranger cannot claim an empty deployment. Without it, bootstrap is allowed only outside production (local dev).
 */
export async function isBootstrapAllowed(): Promise<boolean> {
  const allow = (process.env.BOOTSTRAP_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return process.env.NODE_ENV !== "production";
  const user = await currentUser();
  const primary = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return false;
  return allow.includes(primary.emailAddress.toLowerCase());
}
