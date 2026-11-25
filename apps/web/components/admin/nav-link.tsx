"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { href: string; icon: string; label: string };

/** Sidebar link. Full label on desktop, icon-only rail on tablets (label stays for screen readers). */
export function NavLink({ href, icon, label }: Props) {
  const pathname = usePathname() ?? "";
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-side-muted transition-colors duration-150 hover:bg-side-hover hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand aria-[current=page]:bg-side-hover aria-[current=page]:text-white aria-[current=page]:shadow-[inset_3px_0_0_var(--brand)] rtl:aria-[current=page]:shadow-[inset_-3px_0_0_var(--brand)] md:max-lg:justify-center"
    >
      <span aria-hidden="true" className="w-5 text-center text-base">{icon}</span>
      <span className="md:max-lg:sr-only">{label}</span>
    </Link>
  );
}
