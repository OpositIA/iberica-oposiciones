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
  useSyllabusSubtopicFilesQuery,
  usePreferredOppositionQuery
} from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { ArrowUpRight, BookOpen, ChevronRight } from "lucide-react";
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

  const { data: syllabusSubtopicFiles = [] } = useSyllabusSubtopicFilesQuery(
    oposicionActiva.id,
    Boolean(oposicionActiva.id)
  );

  const subtopicFilesById = useMemo(() => {
    const grouped = new Map<
      number,
      Array<{
        id: number;
        label: string;
        fileName: string;
      }>
    >();

    syllabusSubtopicFiles.forEach((file) => {
      const key = file.subtopic_id;
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

  if (isLoadingOpposition) return <AppLoading label={t("syllabus.loading")} />;

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
	                          subtopicFilesById.get(subtopic.id) ?? [];
	                        const primarySubtopicFile = subtopicFiles[0] ?? null;
	                        const viewerHref = primarySubtopicFile
	                          ? buildSubtopicPdfViewerUrl(
	                              primarySubtopicFile.id,
	                              primarySubtopicFile.label,
	                              subtopic.title
	                            )
	                          : null;

	                        return (
	                          <li
	                            key={`${tema.code}-subtopic-${subtopic.code || subtopicIndex + 1}`}
	                            className="list-none"
	                          >
	                            {viewerHref ? (
	                              <a
	                                href={viewerHref}
	                                target="_blank"
	                                rel="noopener noreferrer"
	                                className="group flex items-center justify-between gap-4 rounded-[0.9rem] border border-border/60 bg-background/65 p-3 text-foreground transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.08] hover:shadow-[0_16px_30px_-24px_rgba(249,115,22,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
	                              >
	                                <div className="flex min-w-0 items-start gap-3 text-sm leading-6">
	                                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5" />
	                                  <span className="break-words">
	                                    {subtopic.title}
	                                  </span>
	                                </div>
	                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary transition-all duration-200 group-hover:border-primary/35 group-hover:bg-primary/15 group-hover:scale-105">
	                                  <ArrowUpRight className="h-4 w-4" />
	                                </span>
	                              </a>
	                            ) : (
	                              <div className="flex items-start gap-3 rounded-[0.9rem] border border-border/60 bg-background/65 p-3 text-sm leading-6 text-foreground">
	                                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
	                                <span className="break-words">
	                                  {subtopic.title}
	                                </span>
	                              </div>
	                            )}
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
	    </div>
	  );
	};

export default ProfileTemario;
