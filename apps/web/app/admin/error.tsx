"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto grid max-w-md gap-3 rounded-card border border-line bg-surface p-6 text-center shadow-card" role="alert">
      <h1 className="m-0 text-lg font-semibold">Something went wrong</h1>
      <p className="m-0 text-sm text-fg-muted">The page could not load. Your data is safe. Try again, and if it keeps happening tell your administrator.</p>
      <div><Button onClick={reset}>Try again</Button></div>
    </section>
  );
}
