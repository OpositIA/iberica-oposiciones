import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const AuthCallback = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);
  const { isAuthReady, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthReady) return;

    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    }

    navigate(isAuthenticated ? "/dashboard" : "/login", { replace: true });
  }, [isAuthReady, isAuthenticated, navigate]);

  return (
    <AppLoading
      variant="fullScreen"
      label={t("common:status.validatingSession")}
    />
  );
};

export default AuthCallback;
