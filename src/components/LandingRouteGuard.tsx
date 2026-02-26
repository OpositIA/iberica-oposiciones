import { useAuth } from "@/auth/AuthProvider";
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("status.validatingSession")}
        </p>
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default LandingRouteGuard;
