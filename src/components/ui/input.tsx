import * as React from "react";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword && showPassword ? "text" : type;
    const input = (
      <input
        type={resolvedType}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isPassword && "pr-10",
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );

    if (!isPassword) return input;

    return (
      <div className="relative w-full">
        {input}
        <button
          type="button"
          className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={() => setShowPassword((current) => !current)}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={
            showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
          }
          disabled={disabled}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
