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
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <section className="w-full max-w-lg rounded-[20px] border border-line bg-surface p-6 shadow-card sm:p-8">
        <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">SchoolOS</p>
        <h1 className="m-0 mb-2 text-2xl font-bold text-fg">Choose an institution</h1>
        <p className="m-0 text-sm text-fg-muted">Select the school workspace you want to open.</p>
        <div className="mt-5 grid gap-2.5">
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
                <button className="flex min-h-14 w-full items-center justify-between gap-4 rounded-card border border-line bg-surface p-4 text-start text-fg transition duration-150 ease-brand hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" type="submit">
                  <strong>{institution.name}</strong>
                  <span className="text-sm text-brand">Open workspace →</span>
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}
