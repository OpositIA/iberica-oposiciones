import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
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

  if (!isAuthReady) {
    return <AppLoading variant="fullScreen" label={t("status.validatingSession")} />;
  }

  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
};

export default ProtectedRoute;
