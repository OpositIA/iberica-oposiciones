import CustomButton from "@/components/ui/custom-button";
import { ArrowRight, Brain } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const ProfileOpositAI = () => {
  const { t } = useTranslation("profile");

  return (
    <section className="border border-border bg-background/95 p-6 md:p-8 space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          {t("opositAI.badge")}
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          {t("opositAI.title")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("opositAI.description")}
        </p>
      </div>

      <div className="border border-border bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
              {t("opositAI.assistant")}
            </p>
            <h3 className="text-xl font-serif text-foreground mb-2">
              {t("opositAI.directAccess")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              {t("opositAI.directAccessDescription")}
            </p>
          </div>
          <CustomButton asChild styleType="primary" className="px-6 py-3">
            <Link to="/asistente-ia">
              <Brain className="h-4 w-4" />
              {t("opositAI.open")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CustomButton>
        </div>
      </div>
    </section>
  );
};

export default ProfileOpositAI;
