import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connectDb, Institution, Membership } from "@schoolos/db";
import { isBootstrapAllowed } from "@/server/bootstrap";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  await connectDb();
  const memberships = await Membership.find({
    clerkUserId: userId,
    active: true,
  }).lean();
  if (memberships.length > 0) redirect("/admin/dashboard");
  const isBootstrapAvailable = !(await Institution.exists({})) && (await isBootstrapAllowed());

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <section className="w-full max-w-lg rounded-[20px] border border-line bg-surface p-6 shadow-card sm:p-8">
        <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">SchoolOS setup</p>
        <h1 className="m-0 mb-3 text-2xl font-bold text-fg">
          {isBootstrapAvailable
            ? "Set up your school"
            : "You need an invitation"}
        </h1>
        {isBootstrapAvailable ? (
          <>
            <p className="m-0 text-sm leading-relaxed text-fg-muted">
              Create the first institution. Your signed-in account will become
              its owner.
            </p>
            <OnboardingForm />
          </>
        ) : (
          <>
            <p className="m-0 text-sm leading-relaxed text-fg-muted">
              Initial setup has already been claimed. Ask an institution owner
              to invite your account.
            </p>
            <Link className={buttonVariants({ className: "mt-5" })} href="/">
              Return home
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
