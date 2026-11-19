import { currentUser } from "@clerk/nextjs/server";
import { connectDb, Institution } from "@schoolos/db";
import { ActionForm } from "@/components/admin/action-form";
import { resolveActiveMembership } from "@/server/auth";
import { getStaffProfile } from "@/server/staff";
import { saveProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const actor = await resolveActiveMembership();
  await connectDb();
  const [school, profile, user] = await Promise.all([
    Institution.findOne({ _id: actor.institutionId }).lean() as unknown as Promise<{ name: string } | null>,
    getStaffProfile(actor.institutionId, actor.membershipId),
    currentUser(),
  ]);
  const role = actor.role.replace(/_/g, " ").toLowerCase();
  const suggestedName = profile?.fullName ?? ([user?.firstName, user?.lastName].filter(Boolean).join(" ") || "");

  return (
    <section className="panel join-card">
      <p className="eyebrow">WELCOME</p>
      <h1>Welcome to {school?.name ?? "your school"}{user?.firstName ? `, ${user.firstName}` : ""}</h1>
      <p className="muted">You joined as <strong>{role}</strong>. Tell us a little about yourself so colleagues and guardians know who you are.</p>
      <ActionForm action={saveProfileAction} submitLabel="Save and continue">
        <label>Full name<input name="fullName" required minLength={2} maxLength={100} defaultValue={suggestedName} autoComplete="name" /></label>
        <label>Mobile number<input name="phone" required inputMode="tel" placeholder="01XXXXXXXXX" defaultValue={profile?.phone ?? ""} autoComplete="tel" /></label>
        <label>Designation (optional)<input name="designation" maxLength={80} placeholder="Assistant teacher" defaultValue={profile?.designation ?? ""} /></label>
        <label>Subjects you teach (optional)<input name="subjects" maxLength={200} placeholder="Quran, Arabic, Math" defaultValue={profile?.subjects ?? ""} /></label>
      </ActionForm>
    </section>
  );
}
