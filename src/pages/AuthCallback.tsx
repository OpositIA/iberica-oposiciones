import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGoogleRegisterContext,
  clearRegisterFlowDraft,
  consumeGoogleRegisterError,
  readGoogleRegisterContext,
  writeGoogleRegisterError
} from "@/lib/registerFlow";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(["common"]);
  const { isAuthReady, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthReady) return;

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
        void supabase.auth.signOut().finally(() => {
          navigate("/registro?step=1&google_error=emailAlreadyExists", {
            replace: true
          });
        });
        return;
      }

      if (!isAuthenticated) {
        navigate("/registro?step=1", { replace: true });
        return;
      }

      if (!googleRegisterContext) {
        navigate("/registro?step=1", { replace: true });
        return;
      }

      const createdAt = Date.parse(user?.created_at ?? "");
      const isExistingGoogleAccount =
        Number.isFinite(createdAt) &&
        googleRegisterContext.initiatedAt > 0 &&
        createdAt < googleRegisterContext.initiatedAt - 30_000;

      if (isExistingGoogleAccount) {
        clearGoogleRegisterContext();
        clearRegisterFlowDraft();
        writeGoogleRegisterError("emailAlreadyExists");

        void supabase.auth.signOut().finally(() => {
          navigate("/registro?step=1&google_error=emailAlreadyExists", {
            replace: true
          });
        });
        return;
      }

      const nextParams = new URLSearchParams();
      nextParams.set("step", "2");
      if (googleRegisterContext.planCode)
        nextParams.set("plan", googleRegisterContext.planCode);

      navigate(`/registro?${nextParams.toString()}`, { replace: true });
      return;
    }

    navigate(isAuthenticated ? "/dashboard" : "/login", { replace: true });
  }, [isAuthReady, isAuthenticated, navigate, searchParams, user]);

  return (
    <AppLoading
      variant="fullScreen"
      label={t("common:status.validatingSession")}
    />
  );
};

export default AuthCallback;
