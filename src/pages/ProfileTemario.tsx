import { useAuth } from "@/auth/AuthProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { type Oposicion } from "@/data/oposicionesDb";
import { usePreferredOppositionQuery } from "@/queries/profileQueries";
import { BookOpen, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const DEFAULT_OPOSICION: Oposicion = {
  id: "",
  nombre: "Oposicion",
  cuerpo: "",
  temas: [],
  temasDetalle: []
};

const ProfileTemario = () => {
  const { t, i18n } = useTranslation(["profile"]);
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

  const temasDetalle = useMemo(() => {
    if (oposicionActiva.temasDetalle.length > 0) return oposicionActiva.temasDetalle;
    return oposicionActiva.temas.map((tema, index) => ({
      code: `topic-${index + 1}`,
      title: tema,
      subtopics: []
    }));
  }, [oposicionActiva.temas, oposicionActiva.temasDetalle]);

  if (isLoadingOpposition) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">{t("syllabus.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <h2 className="text-2xl md:text-3xl font-serif text-foreground">
          {t("syllabus.badge")}
        </h2>
        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-base font-semibold text-foreground">
            {oposicionActiva.nombre}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {oposicionActiva.cuerpo}
          </p>
        </div>
      </section>

      <section className="border border-border bg-background p-5 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">{t("syllabus.topicsList")}</h3>
        </div>

        {temasDetalle.length > 0 ? (
          <Accordion type="single" collapsible className="w-full space-y-2">
            {temasDetalle.map((tema, index) => (
              <AccordionItem
                key={tema.code}
                value={tema.code}
                className="rounded-lg border border-border bg-secondary/25 px-3"
              >
                <AccordionTrigger className="text-left text-sm hover:no-underline">
                  {t("syllabus.topicItem", { index: index + 1, topic: tema.title })}
                </AccordionTrigger>
                <AccordionContent>
                  {tema.subtopics.length > 0 ? (
                    <ul className="space-y-2 pt-1">
                      {tema.subtopics.map((subtopic, subtopicIndex) => (
                        <li
                          key={`${tema.code}-subtopic-${subtopicIndex + 1}`}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{subtopic}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pt-1 text-sm text-muted-foreground">
                      {t("syllabus.noSubtopics", {
                        defaultValue: "Sin subtemas disponibles por ahora."
                      })}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="border border-dashed border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
            {t("syllabus.noTopics", {
              defaultValue: "Esta oposicion todavia no tiene temas cargados."
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ProfileTemario;
