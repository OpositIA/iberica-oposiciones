import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const customButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      styleType: {
        primary:
          "border border-primary bg-primary text-primary-foreground shadow-[0_14px_30px_-20px_hsl(var(--primary)/0.65)] hover:bg-primary/90",
        menu: "border border-border bg-background text-foreground hover:bg-secondary",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground hover:opacity-90",
        ghost:
          "border border-border/70 bg-transparent text-muted-foreground hover:bg-secondary/70",
        subtle:
          "border border-border/70 bg-secondary/40 text-foreground hover:bg-secondary/70",
        unstyled:
          "border-transparent bg-transparent text-current shadow-none hover:bg-transparent"
      },
      size: {
        default: "px-4 py-2.5 text-xs font-semibold tracking-widest uppercase",
        sm: "px-3 py-1.5 text-xs font-semibold tracking-wide",
        lg: "px-6 py-3 text-xs font-semibold tracking-widest uppercase",
        icon: "h-9 w-9 p-0",
        iconSm: "h-8 w-8 p-0",
        none: "h-auto p-0 text-inherit font-inherit tracking-normal normal-case"
      },
      radius: {
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
        none: "rounded-none"
      }
    },
    defaultVariants: {
      styleType: "menu",
      size: "default",
      radius: "md"
    }
  }
);

export type CustomButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof customButtonVariants> & {
    asChild?: boolean;
  };

const CustomButton = React.forwardRef<HTMLButtonElement, CustomButtonProps>(
  (
    { asChild = false, className, radius, size, styleType, type, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const buttonType = asChild ? undefined : (type ?? "button");

    return (
      <Comp
        className={cn(
          customButtonVariants({ styleType, size, radius }),
          className
        )}
        ref={ref}
        type={buttonType}
        {...props}
      />
    );
  }
);

CustomButton.displayName = "CustomButton";

export { customButtonVariants };
export default CustomButton;
