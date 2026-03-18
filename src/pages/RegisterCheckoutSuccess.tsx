import CustomButton from "@/components/ui/custom-button";
import { useToast } from "@/hooks/use-toast";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import {
  clearRegisterFlowDraft,
  readRegisterFlowDraft,
  sanitizeRegisterForm
} from "@/lib/registerFlow";
import { completePaidSignupAfterCheckout } from "@/queries/subscriptionQueries";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

const RegisterCheckoutSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation(["auth"]);
  const { toast } = useToast();
  const locale = normalizeLocale(i18n.resolvedLanguage);
  const draft = readRegisterFlowDraft();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    if (!draft || !sessionId) {
      setStatus("error");
      return;
    }

    const sanitizedForm = sanitizeRegisterForm(draft.form);

    void completePaidSignupAfterCheckout({
      sessionId,
      form: {
        name: sanitizedForm.name,
        lastName: sanitizedForm.lastName,
        email: sanitizedForm.email,
        password: sanitizedForm.password,
        dateOfBirth: sanitizedForm.dateOfBirth,
        preferredOpposition: sanitizedForm.preferredOpposition
      },
      locale
    })
      .then(async ({ autoLogin, accessToken, refreshToken }) => {
        clearRegisterFlowDraft();

        if (autoLogin && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) throw sessionError;

          navigate("/dashboard", { replace: true });
          return;
        }

        toast({
          title: t("auth:register.toasts.checkEmailTitle"),
          description: t("auth:register.toasts.checkEmailDescription")
        });
        navigate("/login", { replace: true });
      })
      .catch((error) => {
        setStatus("error");
        toast({
          variant: "destructive",
          title: t("auth:register.toasts.planContinuationFailedTitle"),
          description:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : t("auth:register.toasts.planContinuationFailedDescription")
        });
      });
  }, [draft, locale, navigate, sessionId, t, toast]);

  if (!draft && !sessionId) return <Navigate replace to="/registro?step=1" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-background p-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.24)]">
        {status === "loading" ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h1 className="mt-6 text-3xl font-serif text-foreground">
              {t("auth:register.paymentCompletingTitle")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("auth:register.paymentCompletingDescription")}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-serif text-foreground">
              {t("auth:register.paymentErrorTitle")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("auth:register.paymentErrorDescription")}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <CustomButton
                type="button"
                styleType="primary"
                onClick={() =>
                  navigate("/registro/planes?step=3", { replace: true })
                }
              >
                {t("auth:register.actions.backToPlanSelection")}
              </CustomButton>
              <CustomButton asChild styleType="menu">
                <Link to="/login">{t("auth:register.signIn")}</Link>
              </CustomButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterCheckoutSuccess;
