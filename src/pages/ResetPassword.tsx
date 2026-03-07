import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import { supabase } from "@/integrations/supabase/client";
import {
  containsUnsafeControlChars,
  sanitizeSingleLineText
} from "@/lib/inputSanitization";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

const MIN_PASSWORD_LENGTH = 8;

const isNetworkError = (message: string) =>
  /network|failed to fetch|fetch failed|timeout/i.test(message);

const getRecoveryLinkErrorFromUrl = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const encodedError =
    searchParams.get("error_description") ??
    hashParams.get("error_description") ??
    searchParams.get("error") ??
    hashParams.get("error");

  if (!encodedError) return null;
  return sanitizeSingleLineText(
    decodeURIComponent(encodedError.replace(/\+/g, " ")),
    200
  );
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["auth"]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const recoveryError = getRecoveryLinkErrorFromUrl();
    if (!recoveryError) return;

    setLinkError(t("auth:resetPassword.errors.invalidOrExpiredLink"));
  }, [t]);

  useEffect(() => {
    let isMounted = true;

    const hasRecoveryTypeInUrl =
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery");

    const validateRecoverySession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (error) {
        setLinkError(t("auth:resetPassword.errors.invalidOrExpiredLink"));
        return;
      }

      if (!data.session && !hasRecoveryTypeInUrl)
        setLinkError(t("auth:resetPassword.errors.invalidOrExpiredLink"));
    };

    void validateRecoverySession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
        if (
          (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") &&
          nextSession
        )
          setLinkError(null);
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [t]);

  const mapUpdatePasswordError = (error: {
    code?: string;
    status?: number;
    message?: string;
  }) => {
    if (error.code === "same_password")
      return t("auth:resetPassword.errors.sameAsCurrent");

    if (error.status === 429) return t("auth:resetPassword.errors.rateLimit");

    const normalizedMessage = error.message?.toLowerCase() ?? "";
    if (normalizedMessage.includes("different from the old password"))
      return t("auth:resetPassword.errors.sameAsCurrent");
    if (normalizedMessage.includes("session"))
      return t("auth:resetPassword.errors.invalidOrExpiredLink");

    if (error.message && isNetworkError(error.message))
      return t("auth:resetPassword.errors.network");

    return t("auth:resetPassword.errors.generic");
  };

  const validateForm = () => {
    if (!password || !confirmPassword)
      return t("auth:resetPassword.validation.required");
    if (
      containsUnsafeControlChars(password) ||
      containsUnsafeControlChars(confirmPassword)
    )
      return t("auth:resetPassword.validation.required");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return t("auth:resetPassword.validation.length", {
        min: MIN_PASSWORD_LENGTH
      });
    }
    if (password !== confirmPassword)
      return t("auth:resetPassword.validation.match");
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setSubmitError(t("auth:resetPassword.errors.invalidOrExpiredLink"));
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setSubmitError(mapUpdatePasswordError(error));
        return;
      }

      // Evita depender de invalidación remota (puede quedarse pendiente en algunos entornos).
      // Con scope local, cerramos sesión en cliente al instante y mantenemos UX estable.
      await supabase.auth.signOut({ scope: "local" });

      navigate("/login", {
        replace: true,
        state: { passwordResetSuccess: true }
      });
    } catch (error) {
      setSubmitError(mapUpdatePasswordError(error as { message?: string }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-16">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-16">
            <img
              src={opositaiHorizontalLogo}
              alt="OpositAI"
              className="h-60 w-auto"
            />
          </Link>
          <h1 className="text-5xl font-serif italic text-slate-100 leading-tight mb-6">
            {t("auth:resetPassword.heroTitleLine1")}
            <br />
            {t("auth:resetPassword.heroTitleLine2")}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {t("auth:resetPassword.heroDescription")}
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <Link to="/" className="flex items-center gap-2 mb-8">
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-4 w-auto"
              />
            </Link>
          </div>

          <h2 className="text-2xl font-serif text-foreground mb-2">
            {t("auth:resetPassword.title")}
          </h2>
          <p className="text-sm text-muted-foreground mb-10">
            {t("auth:resetPassword.subtitle")}
          </p>

          {linkError ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 mb-6"
              role="alert"
            >
              <p className="text-sm text-destructive">{linkError}</p>
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                {t("auth:resetPassword.newPassword")}
              </label>
              <CustomInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth:resetPassword.newPasswordPlaceholder")}
                autoComplete="new-password"
                className="w-full"
                disabled={isSubmitting || Boolean(linkError)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                {t("auth:resetPassword.confirmPassword")}
              </label>
              <CustomInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth:resetPassword.confirmPasswordPlaceholder")}
                autoComplete="new-password"
                className="w-full"
                disabled={isSubmitting || Boolean(linkError)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {t("auth:resetPassword.hint", { min: MIN_PASSWORD_LENGTH })}
            </p>

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}

            <CustomButton
              type="submit"
              styleType="primary"
              disabled={isSubmitting || Boolean(linkError)}
              className="w-full py-3.5"
            >
              {isSubmitting
                ? t("auth:resetPassword.submitting")
                : t("auth:resetPassword.submit")}
            </CustomButton>
          </form>

          <div className="mt-8 text-center">
            <Link
              to="/login"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              {t("auth:resetPassword.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
