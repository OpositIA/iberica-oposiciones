import { cn } from "@/lib/utils";

type AppLoadingProps = {
  label: string;
  description?: string;
  variant?: "fullScreen" | "panel" | "inline";
  className?: string;
};

const AppLoading = ({
  label,
  description,
  variant = "panel",
  className
}: AppLoadingProps) => {
  if (variant === "inline") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "inline-flex items-center gap-2 text-xs font-medium text-muted-foreground",
          className
        )}
      >
        <span className="app-loader-spinner h-3.5 w-3.5 rounded-full border border-border border-t-primary" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex items-center justify-center bg-background",
        variant === "fullScreen"
          ? "min-h-screen"
          : "min-h-[220px] rounded-[1.5rem] border border-border/70 bg-background/90",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="app-loader-spinner h-10 w-10 rounded-full border-2 border-border border-t-primary" />
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-foreground">{label}</h2>
          {description ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default AppLoading;
