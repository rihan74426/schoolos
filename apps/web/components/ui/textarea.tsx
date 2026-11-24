import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn("w-full rounded-[10px] border border-line-strong bg-surface p-3 text-base text-fg placeholder:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
