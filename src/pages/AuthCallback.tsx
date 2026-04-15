import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGoogleRegisterContext,
  clearGoogleRegisterResolutionPending,
  clearGoogleSignupSessionActive,
  clearRegisterFlowDraft,
  consumeGoogleRegisterError,
  markGoogleSignupSessionActive,
  readGoogleRegisterContext,
  writeGoogleLoginError,
  writeGoogleRegisterError
} from "@/lib/registerFlow";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

const hasCompletedRegisterProfile = (
  profile:
    | {
        date_of_birth: string | null;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        preferred_opposition_id: string | null;
      }
    | null
    | undefined
) =>
  Boolean(
    profile?.email &&
    profile.first_name &&
    profile.last_name &&
    profile.date_of_birth &&
    profile.preferred_opposition_id
  );

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(["common"]);
  const { isAuthReady, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthReady) return;

    let isCancelled = false;

    const resolveNavigation = async () => {
      const intent = searchParams.get("intent")?.trim() ?? "";
      const googleRegisterContext = readGoogleRegisterContext();
      const pendingGoogleError = consumeGoogleRegisterError();

      if (window.location.hash) {
        window.history.replaceState(
          window.history.state,
          document.title,
          `${window.location.pathname}${window.location.search}`
        );
      }

      if (intent === "register-google") {
        if (pendingGoogleError === "emailAlreadyExists") {
          clearGoogleSignupSessionActive();
          clearGoogleRegisterResolutionPending();
          await supabase.auth.signOut();
          if (isCancelled) return;
          navigate("/registro?step=1&google_error=emailAlreadyExists", {
            replace: true
          });
          return;
        }

        if (!isAuthenticated) {
          clearGoogleSignupSessionActive();
          clearGoogleRegisterResolutionPending();
          if (isCancelled) return;
          navigate("/registro?step=1", { replace: true });
          return;
        }

        if (!googleRegisterContext || !user) {
          clearGoogleSignupSessionActive();
          clearGoogleRegisterResolutionPending();
          if (isCancelled) return;
          navigate("/registro?step=1", { replace: true });
          return;
        }

        const { data: existingProfile, error: profileError } = await supabase
          .from("profiles")
          .select(
            "email, first_name, last_name, date_of_birth, preferred_opposition_id"
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (isCancelled) return;

        if (hasCompletedRegisterProfile(existingProfile)) {
          clearGoogleSignupSessionActive();
          clearGoogleRegisterResolutionPending();
          clearGoogleRegisterContext();
          clearRegisterFlowDraft();
          writeGoogleRegisterError("emailAlreadyExists");

          await supabase.auth.signOut();
          if (isCancelled) return;
          navigate("/registro?step=1&google_error=emailAlreadyExists", {
            replace: true
          });
          return;
        }

        const nextParams = new URLSearchParams();
        nextParams.set("step", "2");
        if (googleRegisterContext.planCode)
          nextParams.set("plan", googleRegisterContext.planCode);

        markGoogleSignupSessionActive();
        clearGoogleRegisterResolutionPending();
        navigate(`/registro?${nextParams.toString()}`, { replace: true });
        return;
      }

      if (intent === "login-google") {
        if (!isAuthenticated || !user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: existingProfile, error: profileError } = await supabase
          .from("profiles")
          .select(
            "email, first_name, last_name, date_of_birth, preferred_opposition_id"
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (isCancelled) return;

        if (!hasCompletedRegisterProfile(existingProfile)) {
          writeGoogleLoginError("noAccount");
          await supabase.auth.signOut();
          if (isCancelled) return;
          navigate("/login", { replace: true });
          return;
        }

        navigate("/dashboard", { replace: true });
        return;
      }

      navigate(isAuthenticated ? "/dashboard" : "/login", { replace: true });
    };

    void resolveNavigation();

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, isAuthenticated, navigate, searchParams, user]);

  return (
    <AppLoading
      variant="fullScreen"
      label={t("common:status.validatingSession")}
    />
  );
};

export default AuthCallback;
