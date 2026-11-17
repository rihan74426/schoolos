import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Institution, Membership } from "@schoolos/db";
import { connectDb } from "@schoolos/db";
import { setActiveSchoolAction } from "../actions";

export default async function SelectSchoolPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  await connectDb();
  const memberships = (await Membership.find({
    clerkUserId: userId,
    active: true,
  }).lean()) as unknown as Array<{
    institutionId: unknown;
  }>;
  if (memberships.length === 0) redirect("/onboarding");
  if (memberships.length === 1) redirect("/admin/dashboard");

  const institutions = await Promise.all(
    memberships.map(
      ({ institutionId }) =>
        Institution.findById(institutionId).select("name").lean() as Promise<{
          name: string;
        } | null>,
    ),
  );

  return (
    <main className="landing">
      <section className="landing-card onboarding-card">
        <p className="eyebrow">SCHOOLOS</p>
        <h1>Choose an institution</h1>
        <p>Select the school workspace you want to open.</p>
        <div className="school-picker-list">
          {memberships.map((membership, index) => {
            const institution = institutions[index];
            if (!institution) return null;
            return (
              <form
                action={setActiveSchoolAction}
                key={String(membership.institutionId)}
              >
                <input
                  type="hidden"
                  name="institutionId"
                  value={String(membership.institutionId)}
                />
                <button className="school-picker-option" type="submit">
                  {institution.name}
                  <span>Open workspace →</span>
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}
