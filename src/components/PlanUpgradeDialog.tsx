import CustomButton from "@/components/ui/custom-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getPlanKey } from "@/lib/plans";
import {
  ArrowRight,
  Brain,
  Crown,
  FileText,
  ListChecks,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type PlanUpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: "assistant" | "quick-test" | "syllabus-pdf";
  currentPlanName?: string | null;
  currentLimit: number;
  targetLimit: number;
};

const featureIconMap = {
  assistant: Brain,
  "quick-test": ListChecks,
  "syllabus-pdf": FileText
} as const;

const PlanUpgradeDialog = ({
  open,
  onOpenChange,
  feature,
  currentPlanName,
  currentLimit,
  targetLimit
}: PlanUpgradeDialogProps) => {
  const { t } = useTranslation("plans");
  const Icon = featureIconMap[feature];
  const currentPlanKey = getPlanKey({
    tier: currentPlanName?.toLowerCase().includes("pro") ? "pro" : "free"
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/70 bg-background p-0">
        <div className="relative overflow-hidden border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(214,138,69,0.25),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(36,36,36,0.92))] px-6 py-6 text-primary-foreground">
          <div className="pointer-events-none absolute -right-12 -top-10 h-32 w-32 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
              <Icon className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                <Sparkles className="h-3.5 w-3.5" />
                {t("upgradeDialog.badge")}
              </div>
              <h2 className="text-2xl font-serif leading-tight">
                {t(`upgradeDialog.${feature}.title`)}
              </h2>
              <p className="max-w-xl text-sm text-primary-foreground/75">
                {t(`upgradeDialog.${feature}.description`, {
                  currentLimit,
                  targetLimit
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-secondary/25 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t("upgradeDialog.currentPlan")}
              </p>
              <p className="mt-2 text-lg font-serif text-foreground">
                {currentPlanName ??
                  t(`plans.${currentPlanKey}.name`, {
                    defaultValue: t("plans.free.name")
                  })}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`upgradeDialog.${feature}.currentValue`, {
                  value: currentLimit
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-primary/35 bg-primary/10 p-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                <Crown className="h-3.5 w-3.5" />
                {t("plans.pro.name")}
              </div>
              <p className="mt-3 text-lg font-serif text-foreground">
                {t(`upgradeDialog.${feature}.targetLabel`)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`upgradeDialog.${feature}.targetValue`, {
                  value: targetLimit
                })}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border/80 bg-background px-4 py-3 text-sm text-muted-foreground">
            {t("upgradeDialog.footer")}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <CustomButton
              type="button"
              styleType="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("upgradeDialog.cancel")}
            </CustomButton>
            <CustomButton asChild styleType="primary">
              <Link to="/perfil/planes" onClick={() => onOpenChange(false)}>
                {t("upgradeDialog.cta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CustomButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlanUpgradeDialog;
