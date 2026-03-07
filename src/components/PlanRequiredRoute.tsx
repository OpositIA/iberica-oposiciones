import { useAuth } from "@/auth/AuthProvider";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";

type PlanRequiredRouteProps = {
  children: ReactNode;
};

const PlanRequiredRoute = ({ children }: PlanRequiredRouteProps) => {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { isAuthReady, user } = useAuth();
  const { data: planState, isLoading } = useUserPlanStateQuery(user?.id);

  if (!isAuthReady || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("status.validatingSession")}
        </p>
      </div>
    );
  }

  if (!planState) {
    return (
      <Navigate
        to="/seleccion-plan"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
};

export default PlanRequiredRoute;
