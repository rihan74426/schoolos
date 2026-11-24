import * as React from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", {
  variants: {
    tone: {
      brand: "bg-brand-soft text-brand",
      ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok",
      warn: "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn",
      err: "bg-[color-mix(in_srgb,var(--err)_14%,transparent)] text-err",
      muted: "bg-surface-2 text-fg-muted",
    },
  },
  defaultVariants: { tone: "brand" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
