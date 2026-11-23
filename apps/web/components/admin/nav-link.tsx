"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { href: string; icon: string; label: string; variant?: "side" | "tab" };

export function NavLink({ href, icon, label, variant = "side" }: Props) {
  const pathname = usePathname() ?? "";
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      className={variant === "tab" ? "tab-link" : "nav-link"}
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{icon}</span>
      <em>{label}</em>
    </Link>
  );
}
