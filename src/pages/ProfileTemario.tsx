import { useAuth } from "@/auth/AuthProvider";
import { ProfileSyllabusPageSkeleton } from "@/components/PageSkeletons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import Reveal from "@/components/ui/reveal";
import { type Oposicion } from "@/data/oposicionesDb";
import { isPaidPlan } from "@/lib/plans";
import {
  usePreferredOppositionQuery,
  useSyllabusSubtopicFilesQuery
} from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  const sectionClassName =
    "rounded-[1.75rem] border border-border/70 bg-background/95 p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] md:p-8 dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";

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

  if (isLoadingOpposition) return <ProfileSyllabusPageSkeleton />;

  return (
    <div className="space-y-4">
      <Reveal
        as="section"
        className={sectionClassName}
        duration={760}
        variant="soft"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.22em] uppercase text-muted-foreground">
              {t("syllabus.badge")}
            </p>
            <h2 className="text-2xl font-serif text-foreground md:text-3xl">
              {t("syllabus.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("syllabus.description")}
            </p>
          </div>

          <div className="rounded-[1.4rem] border border-border/70 bg-secondary/20 px-4 py-3">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              {t("syllabus.activeOpposition")}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {oposicionActiva.nombre}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {oposicionActiva.cuerpo}
            </p>
            <p className="mt-3 inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              {t("syllabus.topicsList")} · {temasDetalle.length}
            </p>
          </div>
        </div>
      </Reveal>

      {temasDetalle.length > 0 ? (
        <Reveal delay={90} duration={760} variant="soft">
          <Accordion type="single" collapsible className="w-full space-y-4">
            {temasDetalle.map((tema, index) => {
              return (
                <Reveal
                  as={AccordionItem}
                  key={tema.code}
                  value={tema.code}
                  delay={index * 60}
                  duration={720}
                  variant="soft"
                  className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/95 px-4 shadow-[0_20px_44px_-36px_rgba(15,23,42,0.28)] transition-colors hover:border-border dark:shadow-[0_22px_50px_-40px_rgba(0,0,0,0.52)]"
                >
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <span className="flex min-w-0 items-center gap-4 pr-4">
                      <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
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
                      <ul className="space-y-3  p-4">
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
                                  className="group flex items-center justify-between gap-4 rounded-[1rem] border border-border/60 bg-background/80 p-3.5 text-foreground transition-all duration-200 hover:border-primary/30 hover:bg-secondary/25 hover:shadow-[0_18px_34px_-28px_rgba(15,23,42,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                >
                                  <div className="flex min-w-0 items-start gap-3 text-sm leading-6">
                                    <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5" />
                                    <span className="break-words">
                                      {subtopic.title}
                                    </span>
                                  </div>
                                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary transition-all duration-200 group-hover:border-primary/35 group-hover:bg-primary/15 group-hover:scale-105">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </span>
                                </a>
                              ) : (
                                <div className="flex items-start gap-3 rounded-[1rem] border border-border/60 bg-background/80 p-3.5 text-sm leading-6 text-foreground">
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
                      <p className="rounded-[1.25rem] border border-dashed border-border/80 bg-secondary/10 px-4 py-4 text-sm leading-6 text-muted-foreground">
                        {t("syllabus.noSubtopics")}
                      </p>
                    )}
                  </AccordionContent>
                </Reveal>
              );
            })}
          </Accordion>
        </Reveal>
      ) : (
        <Reveal
          className="flex min-h-[220px] items-center justify-center rounded-[1.75rem] border border-dashed border-border/70 bg-secondary/15 px-6 py-10 text-center"
          delay={90}
          duration={720}
          variant="soft"
        >
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            {t("syllabus.noTopics")}
          </p>
        </Reveal>
      )}
    </div>
  );
};

export default ProfileTemario;
