import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type PlanRequiredRouteProps = {
  children: ReactNode;
};

const PlanRequiredRoute = ({ children }: PlanRequiredRouteProps) => {
  const { t } = useTranslation("common");
  const { isAuthReady } = useAuth();

  if (!isAuthReady) {
    return <AppLoading variant="fullScreen" label={t("status.validatingSession")} />;
  }

  return <>{children}</>;
};

export default PlanRequiredRoute;
