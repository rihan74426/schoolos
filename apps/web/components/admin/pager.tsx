import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous/Next links. `href(page)` builds the URL so filters survive paging. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? <Link className={cn(buttonVariants({ variant: "secondary" }))} href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-sm text-fg-muted">Page {page} of {pages}</span>
      {page < pages ? <Link className={cn(buttonVariants({ variant: "secondary" }))} href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
