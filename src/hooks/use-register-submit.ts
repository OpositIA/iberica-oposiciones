import { useToast } from "@/hooks/use-toast";
import type { AppLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRegisterPlanSelectionPath,
  clearRegisterFlowDraft,
  sanitizeRegisterForm,
  type RegisterForm
} from "@/lib/registerFlow";
import {
  changeUserSubscriptionPlan,
  completeFreeSignup
} from "@/queries/subscriptionQueries";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

type RegisterPlanSummary = {
  code: string;
  name: string;
  planKey: string;
  price_cents: number;
};

export const useRegisterSubmit = (locale: AppLocale) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation(["auth"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRegister = async ({
    form,
    selectedPlan
  }: {
    form: RegisterForm;
    selectedPlan: RegisterPlanSummary | null;
  }) => {
    const sanitizedForm = sanitizeRegisterForm(form);
    const planCode = selectedPlan?.code ?? "";
    const planSelectionPath = buildRegisterPlanSelectionPath(planCode);

    setIsSubmitting(true);

    try {
      const { sendEmail, autoLogin, accessToken, refreshToken } =
        await completeFreeSignup({
          form: {
            name: sanitizedForm.name,
            lastName: sanitizedForm.lastName,
            email: sanitizedForm.email,
            password: sanitizedForm.password,
            dateOfBirth: sanitizedForm.dateOfBirth,
            preferredOpposition: sanitizedForm.preferredOpposition
          },
          locale
        });

      if (autoLogin && accessToken && refreshToken) {
        try {
          if (selectedPlan?.price_cents && selectedPlan.price_cents > 0)
            throw new Error("paid_plan_requires_checkout");

          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) throw sessionError;

          if (selectedPlan?.code)
            await changeUserSubscriptionPlan(selectedPlan.code);

          clearRegisterFlowDraft();
          navigate("/dashboard", { replace: true });
          return true;
        } catch (planError) {
          toast({
            variant: "destructive",
            title: t("auth:register.toasts.planContinuationFailedTitle"),
            description:
              planError instanceof Error && planError.message.trim().length > 0
                ? planError.message
                : t("auth:register.toasts.planContinuationFailedDescription")
          });
          navigate(
            selectedPlan?.price_cents && selectedPlan.price_cents > 0
              ? planSelectionPath
              : "/dashboard",
            { replace: true }
          );
          return false;
        }
      }

      clearRegisterFlowDraft();
      if (sendEmail) {
        toast({
          title: t("auth:register.toasts.checkEmailTitle"),
          description: t("auth:register.toasts.checkEmailDescription")
        });
      }
      navigate("/login", { replace: true });
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("auth:register.toasts.createFailedTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("auth:register.toasts.planContinuationFailedDescription")
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, submitRegister };
};
