import * as React from "react";
import { cn } from "@/lib/utils";

// 16px text prevents iOS Safari from zooming on focus.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn("min-h-tap w-full rounded-[10px] border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", className)}
    {...props}
  />
));
Input.displayName = "Input";
