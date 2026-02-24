import { useAuth } from "@/auth/AuthProvider";
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("status.validatingSession")}
        </p>
      </div>
    );
  }

  if (!isAuthenticated)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
};

export default ProtectedRoute;
