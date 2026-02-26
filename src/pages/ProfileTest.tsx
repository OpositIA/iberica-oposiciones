import { useAuth } from "@/auth/AuthProvider";
import { type Oposicion } from "@/data/oposicionesDb";
import { useToast } from "@/hooks/use-toast";
import { usePreferredOppositionQuery } from "@/queries/profileQueries";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

const DEFAULT_OPOSICION: Oposicion = {
  id: "",
  nombre: "Oposicion",
  cuerpo: "",
  temas: [],
  temasDetalle: []
};

const ProfileTest = () => {
  const { t, i18n } = useTranslation(["profile"]);
  const { toast } = useToast();
  const { user, isAuthReady } = useAuth();
  const shouldLoadOpposition = isAuthReady && Boolean(user?.id);

  const { data: preferredOpposition, isLoading: isLoadingOppositionQuery } =
    usePreferredOppositionQuery({
      userId: shouldLoadOpposition ? user?.id : null,
      locale: i18n.resolvedLanguage
    });

  const oposicionActiva = preferredOpposition ?? DEFAULT_OPOSICION;
  const isLoadingOpposition =
    !isAuthReady ||
    (shouldLoadOpposition && !preferredOpposition && isLoadingOppositionQuery);

  const iniciarSimulacro = () => {
    toast({
      title: t("test.toasts.mockReadyTitle"),
      description: t("test.toasts.mockReadyDescription", {
        opposition: oposicionActiva.nombre
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
        <h2 className="text-2xl md:text-3xl font-serif text-foreground">
          {t("test.badge")}
        </h2>
        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-base font-semibold text-foreground">{oposicionActiva.nombre}</p>
          <p className="mt-1 text-xs text-muted-foreground">{oposicionActiva.cuerpo}</p>
        </div>
      </section>

      <section className="border border-border bg-background p-5 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">{t("test.mockMode")}</h3>
        </div>

        <p className="text-sm text-muted-foreground">{t("test.description")}</p>

        <div className="mt-4 border border-dashed border-border bg-secondary/20 px-3 py-3">
          <p className="text-sm text-foreground">
            {t("test.activeOpposition", { opposition: oposicionActiva.nombre })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {oposicionActiva.temas.length} temas disponibles.
          </p>
        </div>

        <button
          type="button"
          onClick={iniciarSimulacro}
          className="mt-4 w-full border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
        >
          {t("test.startMock")}
        </button>
      </section>
    </div>
  );
};

export default ProfileTest;
