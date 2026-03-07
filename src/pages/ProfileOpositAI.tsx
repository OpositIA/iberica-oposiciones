import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import { getPlanKey, isPaidPlan } from "@/lib/plans";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { ArrowRight, Brain, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const ProfileOpositAI = () => {
  const { t } = useTranslation(["profile", "plans"]);
  const { user } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const currentPlanKey = getPlanKey({
    code: planState?.plan_code,
    tier: planState?.tier
  });
  const isCurrentPlanPaid = isPaidPlan(planState);

  return (
    <section className="border border-border bg-background/95 p-6 md:p-8 space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          {t("opositAI.badge")}
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          {t("opositAI.title")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("opositAI.description")}
        </p>
      </div>

      <div className="border border-border bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
              {t("opositAI.assistant")}
            </p>
            <h3 className="text-xl font-serif text-foreground mb-2">
              {t("opositAI.directAccess")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              {t("opositAI.directAccessDescription")}
            </p>
          </div>
          <div className="space-y-3">
            <div
              className={`rounded-2xl border px-4 py-3 ${
                isCurrentPlanPaid
                  ? "border-primary/25 bg-primary/10"
                  : "border-amber-500/25 bg-amber-500/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  className={`h-4 w-4 ${
                    isCurrentPlanPaid ? "text-primary" : "text-amber-700"
                  }`}
                />
                <p className="text-sm font-semibold text-foreground">
                  {t(`plans:plans.${currentPlanKey}.name`)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("profile:opositAI.planSummary", {
                  aiLimit: planState?.ai_daily_limit ?? 3
                })}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <CustomButton asChild styleType="primary" className="px-6 py-3">
                <Link to="/asistente-ia">
                  <Brain className="h-4 w-4" />
                  {t("opositAI.open")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CustomButton>
              {!isCurrentPlanPaid && (
                <CustomButton asChild styleType="menu" className="px-6 py-3">
                  <Link to="/perfil/planes">
                    {t("profile:opositAI.upgrade")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CustomButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileOpositAI;
