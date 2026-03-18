import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import CustomButton from "@/components/ui/custom-button";
import { type Oposicion } from "@/data/oposicionesDb";
import { isPaidPlan } from "@/lib/plans";
import {
  usePaidSyllabusSubtopicFilesQuery,
  usePreferredOppositionQuery
} from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { BookOpen, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const DEFAULT_OPOSICION: Oposicion = {
  id: "",
  nombre: "Oposicion",
  cuerpo: "",
  temarioContenido: null,
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
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const isCurrentPlanPaid = isPaidPlan(planState);

  const oposicionActiva = preferredOpposition ?? DEFAULT_OPOSICION;
  const isLoadingOpposition =
    !isAuthReady ||
    (shouldLoadOpposition && !preferredOpposition && isLoadingOppositionQuery);

  const temasDetalle = useMemo(() => {
    if (oposicionActiva.temasDetalle.length > 0)
      return oposicionActiva.temasDetalle;
    return oposicionActiva.temas.map((tema, index) => ({
      code: `topic-${index + 1}`,
      title: tema,
      displayTitle: tema,
      sectionTitle: null,
      subtopics: []
    }));
  }, [oposicionActiva.temas, oposicionActiva.temasDetalle]);

  const { data: syllabusSubtopicFiles = [] } = usePaidSyllabusSubtopicFilesQuery(
    oposicionActiva.id,
    isCurrentPlanPaid
  );

  const subtopicFilesByCode = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{
        id: number;
        label: string;
        fileName: string;
      }>
    >();

    syllabusSubtopicFiles.forEach((file) => {
      const key = String(file.subtopic_code ?? "").trim();
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push({
        id: file.id,
        label: String(file.file_title ?? "").trim() || file.file_name,
        fileName: file.file_name
      });
    });

    return grouped;
  }, [syllabusSubtopicFiles]);

  const buildSubtopicPdfViewerUrl = (
    subtopicFileId: number,
    fileLabel: string,
    topicTitle: string
  ) => {
    const params = new URLSearchParams();
    if (fileLabel.trim()) params.set("fileLabel", fileLabel.trim());
    if (topicTitle.trim()) params.set("topicTitle", topicTitle.trim());
    const query = params.toString();
    return `/perfil/temario/pdf/${subtopicFileId}${query ? `?${query}` : ""}`;
  };

  if (isLoadingOpposition) {
    return <AppLoading label={t("syllabus.loading")} />;
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
        <div className="mb-5 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">
            {t("syllabus.topicsList")}
          </h3>
        </div>

        {temasDetalle.length > 0 ? (
          <Accordion type="single" collapsible className="w-full space-y-4">
            {temasDetalle.map((tema, index) => {
              return (
                <AccordionItem
                  key={tema.code}
                  value={tema.code}
                  className="overflow-hidden rounded-[1.25rem] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] px-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.35)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(15,23,42,0.5))]"
                >
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <span className="flex min-w-0 items-start gap-4 pr-4">
                      <span className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="min-w-0 space-y-1">
                        <span className="block text-base font-semibold leading-6 text-foreground md:text-lg">
                          {tema.title}
                        </span>
                        {tema.sectionTitle ? (
                          <span className="block text-sm leading-6 text-muted-foreground">
                            {tema.sectionTitle}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    {tema.subtopics.length > 0 ? (
                      <ul className="space-y-3 rounded-[1rem] border border-border/70 bg-secondary/15 p-4">
                        {tema.subtopics.map((subtopic, subtopicIndex) => {
                          const subtopicFiles =
                            subtopicFilesByCode.get(subtopic.code) ?? [];

                          return (
                            <li
                              key={`${tema.code}-subtopic-${subtopic.code || subtopicIndex + 1}`}
                              className="rounded-[0.9rem] border border-border/60 bg-background/65 p-3"
                            >
                              <div className="flex items-start gap-3 text-sm leading-6 text-foreground">
                                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="break-words">{subtopic.title}</span>
                              </div>

                              {isCurrentPlanPaid && subtopicFiles.length > 0 ? (
                                <div className="mt-3 flex flex-col gap-2 pl-6">
                                  {subtopicFiles.map((file) => {
                                    return (
                                      <div
                                        key={`${subtopic.code}-file-${file.id}`}
                                        className="flex flex-col gap-3 rounded-[0.9rem] border border-border/70 bg-secondary/10 p-3 md:flex-row md:items-center md:justify-between"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-foreground">
                                            {file.label}
                                          </p>
                                          <p className="truncate text-xs text-muted-foreground">
                                            {file.fileName}
                                          </p>
                                        </div>

                                        <CustomButton
                                          asChild
                                          className="md:w-auto"
                                        >
                                          <a
                                            href={buildSubtopicPdfViewerUrl(
                                              file.id,
                                              file.label,
                                              subtopic.title
                                            )}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            {t("syllabus.viewerButton", {
                                              defaultValue: "Ver temario"
                                            })}
                                          </a>
                                        </CustomButton>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="rounded-[1rem] border border-dashed border-border/80 bg-secondary/10 px-4 py-3 text-sm leading-6 text-muted-foreground">
                        {t("syllabus.noSubtopics", {
                          defaultValue: "Sin subtemas disponibles por ahora."
                        })}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="border border-dashed border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
            {t("syllabus.noTopics", {
              defaultValue: "Esta oposicion todavia no tiene temas cargados."
            })}
          </div>
        )}
      </section>

      <section className="border border-border bg-background p-5 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-serif text-foreground">
            {t("syllabus.contentTitle")}
          </h3>
        </div>

        {isCurrentPlanPaid ? (
          oposicionActiva.temarioContenido ? (
            <article className="rounded-xl border border-border/70 bg-secondary/15 p-4 text-sm leading-relaxed text-foreground whitespace-pre-line">
              {oposicionActiva.temarioContenido}
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("syllabus.noContent")}
            </p>
          )
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4">
            <p className="text-sm font-semibold text-foreground">
              {t("syllabus.contentLockedTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("syllabus.contentLockedDescription")}
            </p>
            <CustomButton asChild className="mt-4">
              <Link to="/perfil/planes">{t("syllabus.contentLockedCta")}</Link>
            </CustomButton>
          </div>
        )}
      </section>
    </div>
  );
};

export default ProfileTemario;
