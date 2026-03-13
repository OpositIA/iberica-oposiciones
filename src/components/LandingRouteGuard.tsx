import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

type LandingRouteGuardProps = {
  children: ReactNode;
};

const LandingRouteGuard = ({ children }: LandingRouteGuardProps) => {
  const { t } = useTranslation("common");
  const { isAuthReady, isAuthenticated } = useAuth();

  if (!isAuthReady) {
    return <AppLoading variant="fullScreen" label={t("status.validatingSession")} />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default LandingRouteGuard;
