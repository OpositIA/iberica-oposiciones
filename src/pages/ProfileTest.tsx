import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import { resolverOposicionPorNombre } from "@/data/oposiciones";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { runSingleFlight } from "@/lib/singleFlight";
import { ArrowRight, FileText, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const ProfileTest = () => {
  const { t } = useTranslation(["profile", "oppositions"]);
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const [oposicionActiva, setOposicionActiva] = useState(() =>
    resolverOposicionPorNombre(null)
  );
  const [temaSeleccionado, setTemaSeleccionado] = useState("");
  const [isLoadingOpposition, setIsLoadingOpposition] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;
    const userId = user?.id;

    if (!userId) {
      setIsLoadingOpposition(false);
      return;
    }

    let isMounted = true;

    const loadPreferredOpposition = async () => {
      const { data } = await runSingleFlight(
        `profile-test:preferred-opposition:${userId}`,
        () =>
          supabase
            .from("profiles")
            .select("preferred_opposition")
            .eq("user_id", userId)
            .maybeSingle(),
        { reuseResultForMs: 1500 }
      );

      if (!isMounted) return;

      const resolved = resolverOposicionPorNombre(data?.preferred_opposition);
      setOposicionActiva(resolved);
      setTemaSeleccionado(resolved.temas[0] ?? "");
      setIsLoadingOpposition(false);
    };

    void loadPreferredOpposition();

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, user?.id]);

  const iniciarSimulacro = () => {
    toast({
      title: t("test.toasts.mockReadyTitle"),
      description: t("test.toasts.mockReadyDescription", {
        opposition: oposicionActiva.nombre
      })
    });
  };

  const iniciarTestRapido = () => {
    if (!temaSeleccionado) {
      toast({
        variant: "destructive",
        title: t("test.toasts.selectTopicTitle"),
        description: t("test.toasts.selectTopicDescription")
      });
      return;
    }

    toast({
      title: t("test.toasts.quickTestReadyTitle"),
      description: t("test.toasts.quickTestReadyDescription", {
        topic: temaSeleccionado
      })
    });
  };

  if (isLoadingOpposition) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">{t("test.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
          {t("test.badge")}
        </p>
        <h2 className="text-xl md:text-2xl font-serif text-foreground mb-2">
          {t("test.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("test.description")}</p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {t("test.mockMode")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("test.activeOpposition", { opposition: oposicionActiva.nombre })}
          </p>
          <CustomButton
            type="button"
            onClick={iniciarSimulacro}
            styleType="menu"
            className="w-full"
          >
            {t("test.startMock")}
          </CustomButton>
        </div>

        <div className="border border-border bg-background p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {t("test.quickMode")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("test.selectTopicOf", { opposition: oposicionActiva.nombre })}
          </p>
          <CustomButton
            type="button"
            onClick={iniciarTestRapido}
            styleType="primary"
            className="w-full"
            disabled={!temaSeleccionado}
          >
            {t("test.launchQuickTest")}
            <ArrowRight className="h-4 w-4" />
          </CustomButton>
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="mb-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">
            {t("test.quickTopics")}
          </p>
          <p className="text-sm text-foreground">
            {t("test.selectTopic", { opposition: oposicionActiva.nombre })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {oposicionActiva.temas.map((tema) => (
            <CustomButton
              key={tema}
              type="button"
              onClick={() => setTemaSeleccionado(tema)}
              styleType={tema === temaSeleccionado ? "primary" : "menu"}
              size="sm"
              className={`px-3 py-1.5 text-xs border transition-colors ${
                tema === temaSeleccionado
                  ? "border-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {tema}
            </CustomButton>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProfileTest;
