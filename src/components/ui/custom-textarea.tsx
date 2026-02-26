import * as React from "react";

import { cn } from "@/lib/utils";

const resizeModeClasses = {
  both: "resize",
  horizontal: "resize-x",
  none: "resize-none",
  vertical: "resize-y"
} as const;

export type CustomTextareaProps = React.ComponentPropsWithoutRef<"textarea"> & {
  resize?: keyof typeof resizeModeClasses;
};

const CustomTextarea = React.forwardRef<
  HTMLTextAreaElement,
  CustomTextareaProps
>(({ className, resize = "vertical", ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      resizeModeClasses[resize],
      className
    )}
    {...props}
  />
));

CustomTextarea.displayName = "CustomTextarea";

export default CustomTextarea;
