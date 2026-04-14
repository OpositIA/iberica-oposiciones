import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { hasOngoingGoogleRegisterFlow } from "@/lib/registerFlow";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";

type LandingRouteGuardProps = {
  children: ReactNode;
};

const LandingRouteGuard = ({ children }: LandingRouteGuardProps) => {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { isAuthReady, isAuthenticated } = useAuth();

  if (!isAuthReady) {
    return (
      <AppLoading variant="fullScreen" label={t("status.validatingSession")} />
    );
  }

  const allowsGoogleRegister =
    location.pathname.startsWith("/registro") && hasOngoingGoogleRegisterFlow();
  const allowsGoogleRegisterError =
    location.pathname.startsWith("/registro") &&
    new URLSearchParams(location.search).get("google_error") ===
      "emailAlreadyExists";
  const allowsRegisterAccess =
    allowsGoogleRegister || allowsGoogleRegisterError;

  if (isAuthenticated && !allowsRegisterAccess)
    return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default LandingRouteGuard;
