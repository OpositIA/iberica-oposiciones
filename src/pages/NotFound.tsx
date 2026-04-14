import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation("notFound");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("message")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("backHome")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
