import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import {
  hasGoogleSignupSessionActive,
  hasPendingGoogleRegisterResolution
} from "@/lib/registerFlow";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";

type ProtectedRouteProps = {
  children: ReactNode;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { isAuthReady, isAuthenticated } = useAuth();
  const isResolvingGoogleRegister = hasPendingGoogleRegisterResolution();
  const isTemporaryGoogleSignupSession = hasGoogleSignupSessionActive();
  const isPdfViewerRoute = location.pathname.startsWith("/perfil/temario/pdf/");

  if (!isAuthReady) {
    if (isPdfViewerRoute) return null;

    return (
      <AppLoading variant="fullScreen" label={t("status.validatingSession")} />
    );
  }

  if (isResolvingGoogleRegister) {
    return (
      <AppLoading variant="fullScreen" label={t("status.validatingSession")} />
    );
  }

  if (!isAuthenticated || isTemporaryGoogleSignupSession)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
};

export default ProtectedRoute;
