import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import type { AppLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGoogleRegisterContext,
  clearGoogleSignupSessionActive,
  clearRegisterFlowDraft,
  sanitizeRegisterForm,
  type RegisterForm
} from "@/lib/registerFlow";
import {
  changeUserSubscriptionPlan,
  completeFreeSignup,
  createStripeCheckoutSession
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
  const { refreshProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearRegisterState = () => {
    clearGoogleSignupSessionActive();
    clearRegisterFlowDraft();
    clearGoogleRegisterContext();
  };

  const updateGoogleSignupProfile = async ({
    form
  }: {
    form: RegisterForm;
  }) => {
    const sanitizedForm = sanitizeRegisterForm(form);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user)
      throw new Error("Debes iniciar sesion para continuar con Google.");

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nextMetadata = {
      ...metadata,
      first_name: sanitizedForm.name,
      last_name: sanitizedForm.lastName,
      full_name: `${sanitizedForm.name} ${sanitizedForm.lastName}`.trim(),
      date_of_birth: sanitizedForm.dateOfBirth || null,
      preferred_opposition_id: sanitizedForm.preferredOpposition || null,
      preferred_opposition: sanitizedForm.preferredOpposition || null,
      locale
    };

    const { error: metadataError } = await supabase.auth.updateUser({
      data: nextMetadata
    });
    if (metadataError) throw metadataError;

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        email: sanitizedForm.email,
        first_name: sanitizedForm.name,
        last_name: sanitizedForm.lastName,
        date_of_birth: sanitizedForm.dateOfBirth || null,
        preferred_opposition_id: sanitizedForm.preferredOpposition || null,
        preferred_opposition: sanitizedForm.preferredOpposition || null,
        locale
      },
      { onConflict: "user_id" }
    );

    if (profileError) throw profileError;

    await refreshProfile();

    return sanitizedForm;
  };

  const preparePaidCheckout = async ({ form }: { form: RegisterForm }) => {
    const sanitizedForm = sanitizeRegisterForm(form);

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

      clearRegisterState();

      if (autoLogin && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) throw sessionError;

        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (user?.email_confirmed_at) return true;
      }

      toast({
        title: t("auth:register.toasts.verifyEmailBeforePaymentTitle"),
        description: sendEmail
          ? t("auth:register.toasts.verifyEmailBeforePaymentDescription")
          : t("auth:register.toasts.checkEmailDescription")
      });
      navigate("/login", { replace: true });
      return false;
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

  const prepareGooglePaidCheckout = async ({
    form,
    planCode
  }: {
    form: RegisterForm;
    planCode: string;
  }) => {
    setIsSubmitting(true);

    try {
      await updateGoogleSignupProfile({ form });
      clearRegisterState();

      return await createStripeCheckoutSession({
        planCode,
        source: "plan_selection"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRegister = async ({
    form,
    selectedPlan
  }: {
    form: RegisterForm;
    selectedPlan: RegisterPlanSummary | null;
  }) => {
    const sanitizedForm = sanitizeRegisterForm(form);

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

          clearRegisterState();
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
          navigate("/dashboard", { replace: true });
          return false;
        }
      }

      clearRegisterState();
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

  const submitGoogleRegister = async ({
    form,
    selectedPlan
  }: {
    form: RegisterForm;
    selectedPlan: RegisterPlanSummary | null;
  }) => {
    setIsSubmitting(true);

    try {
      await updateGoogleSignupProfile({ form });

      if (selectedPlan?.code)
        await changeUserSubscriptionPlan(selectedPlan.code);

      clearRegisterState();
      navigate("/dashboard", { replace: true });
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

  return {
    isSubmitting,
    preparePaidCheckout,
    prepareGooglePaidCheckout,
    submitGoogleRegister,
    submitRegister
  };
};
