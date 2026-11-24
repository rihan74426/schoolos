import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select (best mobile UX, free RTL/a11y), styled to match Input. 16px stops iOS zoom. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("min-h-tap w-full rounded-[10px] border border-line-strong bg-surface px-3 text-base text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", className)}
    {...props}
  />
));
Select.displayName = "Select";
