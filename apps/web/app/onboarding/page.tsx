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
    <main className="landing">
      <section className="landing-card onboarding-card">
        <p className="eyebrow">SCHOOLOS SETUP</p>
        <h1>
          {isBootstrapAvailable
            ? "Set up your school"
            : "You need an invitation"}
        </h1>
        {isBootstrapAvailable ? (
          <>
            <p>
              Create the first institution. Your signed-in account will become
              its owner.
            </p>
            <OnboardingForm />
          </>
        ) : (
          <>
            <p>
              Initial setup has already been claimed. Ask an institution owner
              to invite your account.
            </p>
            <Link className="button-link" href="/">
              Return home
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
