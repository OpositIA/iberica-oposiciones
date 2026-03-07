import { useAuth } from "@/auth/AuthProvider";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

type LandingRouteGuardProps = {
  children: ReactNode;
};

const LandingRouteGuard = ({ children }: LandingRouteGuardProps) => {
  const { t } = useTranslation("common");
  const { isAuthReady, isAuthenticated, user } = useAuth();
  const { data: planState, isLoading } = useUserPlanStateQuery(user?.id);

  if (!isAuthReady || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("status.validatingSession")}
        </p>
      </div>
    );
  }

  if (isAuthenticated)
    {return (
      <Navigate to={planState ? "/dashboard" : "/seleccion-plan"} replace />
    );}

  return <>{children}</>;
};

export default LandingRouteGuard;
