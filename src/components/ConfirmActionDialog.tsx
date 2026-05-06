import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: "primary" | "destructive";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
};

const ConfirmActionDialog = ({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel,
  cancelLabel,
  confirmStyle = "primary",
  isLoading = false,
  onConfirm
}: ConfirmActionDialogProps) => {
  const { t } = useTranslation("common");
  const isDestructive = confirmStyle === "destructive";

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md overflow-hidden rounded-3xl border border-border/70 bg-background/95 p-0 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none h-1.5 bg-gradient-to-r from-primary/75 via-primary/40 to-transparent" />
        <AlertDialogHeader className="space-y-4 px-6 pt-6 pb-4 text-left">
          <div
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
              isDestructive
                ? "border-destructive/35 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary"
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <AlertDialogTitle className="text-base font-semibold leading-tight">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </AlertDialogDescription>
          </div>
          {warning && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-border/70 bg-secondary/20 px-6 py-4 sm:justify-end">
          <AlertDialogCancel disabled={isLoading} className="rounded-xl">
            {cancelLabel ?? t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={
              isDestructive
                ? "rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "rounded-xl"
            }
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel ?? t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmActionDialog;
