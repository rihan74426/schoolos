import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <section className="mx-auto grid max-w-md gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-card">
      <h1 className="m-0 text-lg font-semibold">Page not found</h1>
      <p className="m-0 text-sm text-fg-muted">It may have been removed, or you may not have access to it.</p>
      <div><Link href="/admin/dashboard" className={buttonVariants()}>Back to dashboard</Link></div>
    </section>
  );
}
