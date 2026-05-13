import * as React from "react";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

const CustomInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<"input">
>(({ className, type = "text", disabled, ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;

  const input = (
    <input
      ref={ref}
      type={resolvedType}
      disabled={disabled}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        isPassword && "pr-10",
        className
      )}
      {...props}
    />
  );

  if (!isPassword) return input;

  return (
    <div className="relative w-full">
      {input}
      <button
        type="button"
        className="absolute right-[0.3rem] top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        onClick={() => setShowPassword((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
});

CustomInput.displayName = "CustomInput";

export default CustomInput;
