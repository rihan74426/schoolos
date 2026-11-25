"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Item = { href: string; icon: string; label: string };

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Phone navigation: up to 4 primary tabs plus a "More" sheet so every module the role may use is reachable. */
export function MobileNav({ items, moreLabel }: { items: Item[]; moreLabel: string }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  const overflow = items.length > 5;
  const primary = overflow ? items.slice(0, 4) : items;
  const moreActive = overflow && items.slice(4).some((i) => isActive(pathname, i.href));
  const tab = "grid min-h-14 min-w-0 justify-items-center gap-0.5 px-0.5 py-2 text-xs text-fg-muted";

  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-20 grid auto-cols-fr grid-flow-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {primary.map((item) => (
        <Link key={item.href} href={item.href} className={cn(tab, isActive(pathname, item.href) && "font-semibold text-brand")} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          <span aria-hidden="true" className="text-lg leading-none">{item.icon}</span>
          <span className="max-w-full truncate">{item.label}</span>
        </Link>
      ))}
      {overflow ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className={cn(tab, "border-0 bg-transparent", moreActive && "font-semibold text-brand")} aria-label={moreLabel}>
            <span aria-hidden="true" className="text-lg leading-none">☰</span>
            <span>{moreLabel}</span>
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle className="mb-3 text-base font-semibold text-fg">{moreLabel}</SheetTitle>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 xs:grid-cols-3">
              {items.map((item) => (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={cn("grid min-h-20 content-center justify-items-center gap-1 rounded-card border border-line bg-surface-2 p-2 text-center text-sm text-fg", isActive(pathname, item.href) && "border-brand bg-brand-soft font-semibold text-brand")}
                    >
                      <span aria-hidden="true" className="text-xl leading-none">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </SheetClose>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      ) : null}
    </nav>
  );
}
