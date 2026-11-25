import * as React from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const noticeVariants = cva("m-0 text-sm", {
  variants: {
    tone: {
      error: "rounded-[10px] bg-[color-mix(in_srgb,var(--err)_12%,transparent)] px-3 py-2 text-err",
      ok: "rounded-[10px] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] px-3 py-2 text-ok",
      hint: "text-xs text-fg-muted",
    },
  },
  defaultVariants: { tone: "hint" },
});

/** Inline message. Errors are announced to screen readers; hints are quiet helper text. */
export function Notice({ tone, className, ...props }: React.HTMLAttributes<HTMLParagraphElement> & VariantProps<typeof noticeVariants>) {
  return <p role={tone === "error" ? "alert" : tone === "ok" ? "status" : undefined} className={cn(noticeVariants({ tone }), className)} {...props} />;
}
