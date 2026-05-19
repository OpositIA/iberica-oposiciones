import { useAuth } from "@/auth/AuthProvider";
import { ProfileTestPageSkeleton } from "@/components/PageSkeletons";
import PlanUpgradeDialog from "@/components/PlanUpgradeDialog";
import { Checkbox } from "@/components/ui/checkbox";
import CustomButton from "@/components/ui/custom-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { type Oposicion } from "@/data/oposicionesDb";
import { useToast } from "@/hooks/use-toast";
import { getPlanKey, isPaidPlan } from "@/lib/plans";
import {
  clearQuickTestProgress,
  clearQuickTestSessionPayload,
  setQuickTestSessionPayload
} from "@/lib/quickTestStorage";
import { usePreferredOppositionQuery } from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  discardInProgressQuickTests,
  fetchCurrentOppositionPrimaryTestExamConfig,
  fetchLatestInProgressQuickTest,
  fetchReusableQuickTestSession,
  generateQuickTest,
  isUuid,
  upsertQuickTestSession,
  type InProgressQuickTestSummary,
  type OppositionTestExamConfig,
  type QuickTestSessionPayload,
  type QuickTestTopicSelection
} from "@/queries/testQueries";
import {
  ArrowRight,
  Clock3,
  FileText,
  ListChecks,
  Loader2,
  RotateCcw
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

const DEFAULT_OPOSICION: Oposicion = {
  id: "",
  nombre: "Oposicion",
  cuerpo: "",
  temas: [],
  temasDetalle: []
};

const QUICK_TEST_MIN_QUESTIONS = 1;
const QUICK_TEST_MAX_QUESTIONS = 100;
const QUICK_TEST_DEFAULT_QUESTIONS = 30;

type QuickBlockOption = {
  code: string;
  title: string;
  displayTitle: string;
  topics: {
    id: string;
    label: string;
  }[];
};

type TestLaunchMode = "mock" | "quick";

const buildClientUuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();

  const hex = "0123456789abcdef";
  const randomHex = (size: number) =>
    Array.from(
      { length: size },
      () => hex[Math.floor(Math.random() * hex.length)]
    ).join("");

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
};

const formatCountdown = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const ProfileTest = () => {
  const { t, i18n } = useTranslation(["profile"]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const sectionClassName =
    "rounded-[1.75rem] border border-border/70 bg-background/95 p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] md:p-8 dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";
  const optionPanelClassName =
    "rounded-[1.5rem] border border-border/70 bg-background/95 p-5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.24)] transition-colors dark:shadow-[0_22px_50px_-40px_rgba(0,0,0,0.44)]";
  const { user, isAuthReady } = useAuth();
  const shouldLoadOpposition = isAuthReady && Boolean(user?.id);
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const currentPlanKey = getPlanKey({
    code: planState?.plan_code,
    tier: planState?.tier
  });
  const isCurrentPlanPaid = isPaidPlan(planState);
  const quickTestQuestionLimit = planState?.quick_test_question_limit ?? 20;

  const { data: preferredOpposition, isLoading: isLoadingOppositionQuery } =
    usePreferredOppositionQuery({
      userId: shouldLoadOpposition ? user?.id : null,
      locale: i18n.resolvedLanguage
    });

  const oposicionActiva = preferredOpposition ?? DEFAULT_OPOSICION;
  const isLoadingOpposition =
    !isAuthReady ||
    (shouldLoadOpposition && !preferredOpposition && isLoadingOppositionQuery);

  const quickBlocks = useMemo<QuickBlockOption[]>(
    () =>
      oposicionActiva.temasDetalle.map((block) => {
        const topics =
          block.subtopics.length > 0
            ? block.subtopics.map((subtopic) => ({
                id: subtopic.code || `${block.code}:${subtopic.id}`,
                label: subtopic.title
              }))
            : [{ id: block.code, label: block.title }];

        return {
          code: block.code,
          title: block.title,
          displayTitle: block.displayTitle,
          topics
        };
      }),
    [oposicionActiva.temasDetalle]
  );

  const allTopicIds = useMemo(
    () => quickBlocks.flatMap((block) => block.topics.map((topic) => topic.id)),
    [quickBlocks]
  );

  const topicLabelById = useMemo(() => {
    const lookup = new Map<string, string>();
    quickBlocks.forEach((block) => {
      block.topics.forEach((topic) => {
        lookup.set(topic.id, topic.label);
      });
    });
    return lookup;
  }, [quickBlocks]);

  const [isQuickTestDialogOpen, setIsQuickTestDialogOpen] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [quickTestQuestionCount, setQuickTestQuestionCount] = useState(
    QUICK_TEST_DEFAULT_QUESTIONS
  );
  const [isGeneratingQuickTest, setIsGeneratingQuickTest] = useState(false);
  const [isInProgressDialogOpen, setIsInProgressDialogOpen] = useState(false);
  const [inProgressTest, setInProgressTest] =
    useState<InProgressQuickTestSummary | null>(null);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const [mockExamConfig, setMockExamConfig] =
    useState<OppositionTestExamConfig | null>(null);
  const [pendingLaunchMode, setPendingLaunchMode] =
    useState<TestLaunchMode>("quick");

  const minimumQuestionCount = Math.max(
    QUICK_TEST_MIN_QUESTIONS,
    selectedTopicIds.length
  );

  useEffect(() => {
    setSelectedTopicIds((prev) => {
      const availableTopicIdSet = new Set(allTopicIds);
      const filtered = prev.filter((topicId) =>
        availableTopicIdSet.has(topicId)
      );
      if (filtered.length > 0) return filtered;
      return allTopicIds.slice(0, 1);
    });
  }, [allTopicIds]);

  useEffect(() => {
    setQuickTestQuestionCount((prev) => {
      const upperBound = Math.min(
        QUICK_TEST_MAX_QUESTIONS,
        quickTestQuestionLimit
      );
      return Math.min(upperBound, Math.max(minimumQuestionCount, prev));
    });
  }, [minimumQuestionCount, quickTestQuestionLimit]);

  useEffect(() => {
    let isCancelled = false;
    if (!oposicionActiva.id) {
      setMockExamConfig(null);
      return;
    }

    void fetchCurrentOppositionPrimaryTestExamConfig(oposicionActiva.id)
      .then((config) => {
        if (!isCancelled) setMockExamConfig(config);
      })
      .catch(() => {
        if (!isCancelled) setMockExamConfig(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [oposicionActiva.id]);

  const selectedTopicIdSet = useMemo(
    () => new Set(selectedTopicIds),
    [selectedTopicIds]
  );
  const selectedTopicLabels = useMemo(
    () =>
      selectedTopicIds
        .map((topicId) => topicLabelById.get(topicId))
        .filter((topicLabel): topicLabel is string => Boolean(topicLabel)),
    [selectedTopicIds, topicLabelById]
  );
  const inProgressPendingQuestions = useMemo(() => {
    const totalQuestions = inProgressTest?.questionCount ?? 0;
    const answeredQuestions = inProgressTest?.answeredCount ?? 0;
    return Math.max(0, totalQuestions - answeredQuestions);
  }, [inProgressTest?.answeredCount, inProgressTest?.questionCount]);
  const inProgressRemainingTime = useMemo(() => {
    const remainingSeconds = inProgressTest?.pausedRemainingSeconds;
    if (
      typeof remainingSeconds !== "number" ||
      !Number.isFinite(remainingSeconds)
    )
      return "--:--";
    return formatCountdown(remainingSeconds);
  }, [inProgressTest?.pausedRemainingSeconds]);

  const buildSelectedTopicsPayload = (
    topicIds: string[]
  ): QuickTestTopicSelection[] => {
    const selectedTopicIdSetForPayload = new Set(topicIds);

    return quickBlocks.reduce<QuickTestTopicSelection[]>((acc, block) => {
      const blockTopicIds = block.topics.map((topic) => topic.id);
      const selectedCount = blockTopicIds.filter((topicId) =>
        selectedTopicIdSetForPayload.has(topicId)
      ).length;

      if (selectedCount === 0) return acc;
      if (selectedCount === blockTopicIds.length) {
        acc.push({
          id: block.code,
          label: block.displayTitle || block.title,
          scope: "block"
        });
        return acc;
      }

      acc.push(
        ...block.topics
          .filter((topic) => selectedTopicIdSetForPayload.has(topic.id))
          .map(
            (topic): QuickTestTopicSelection => ({
              id: topic.id,
              label: topic.label,
              scope: "topic"
            })
          )
      );

      return acc;
    }, []);
  };

  const launchGeneratedTest = async ({
    mode,
    forceNew = false,
    questionCount,
    selectedTopicsPayload
  }: {
    mode: TestLaunchMode;
    forceNew?: boolean;
    questionCount: number;
    selectedTopicsPayload: QuickTestTopicSelection[];
  }) => {
    if (!user?.id) {
      toast({
        variant: "destructive",
        title: t("test.toasts.missingSessionTitle"),
        description: t("test.toasts.missingSessionDescription")
      });
      return;
    }

    if (!isCurrentPlanPaid) {
      setIsUpgradeDialogOpen(true);
      return;
    }

    if (selectedTopicsPayload.length === 0) {
      toast({
        variant: "destructive",
        title: t("test.toasts.selectTopicTitle"),
        description: t("test.quickDialogNoTopics")
      });
      return;
    }

    setPendingLaunchMode(mode);

    if (!forceNew) {
      try {
        const existingAttempt = await fetchLatestInProgressQuickTest(user.id);
        if (existingAttempt) {
          setInProgressTest(existingAttempt);
          setIsInProgressDialogOpen(true);
          return;
        }
      } catch {
        // Non-blocking: continue launching even if the in-progress check fails.
      }
    }

    setIsGeneratingQuickTest(true);

    try {
      if (forceNew) {
        const discardedTestIds = await discardInProgressQuickTests(user.id);
        discardedTestIds.forEach((testId) => {
          clearQuickTestProgress(testId);
          clearQuickTestSessionPayload(testId);
        });
        setInProgressTest(null);
      }

      if (mode === "quick") {
        const reusableQuickTest = await fetchReusableQuickTestSession({
          userId: user.id,
          oppositionId: oposicionActiva.id,
          questionCount,
          selectedTopics: selectedTopicsPayload
        });

        if (reusableQuickTest) {
          setQuickTestSessionPayload(reusableQuickTest);
          toast({
            title: t("test.toasts.quickTestReadyTitle"),
            description: t("test.toasts.quickTestReadyDescription", {
              topicCount: reusableQuickTest.selectedTopics.length,
              questionCount: reusableQuickTest.questionCount
            })
          });
          setIsQuickTestDialogOpen(false);
          navigate(
            `/perfil/test/${encodeURIComponent(reusableQuickTest.testId)}`,
            {
              state: {
                quickTest: reusableQuickTest
              }
            }
          );
          return;
        }
      }

      const data = await generateQuickTest({
        mode,
        oppositionId: oposicionActiva.id,
        oppositionName: oposicionActiva.nombre,
        questionCount,
        locale: i18n.resolvedLanguage ?? "es",
        selectedTopics: selectedTopicsPayload
      });

      const generatedQuestionCount =
        Array.isArray(data?.questions) && data.questions.length > 0
          ? data.questions.length
          : typeof data?.questionCount === "number" &&
              Number.isFinite(data.questionCount)
            ? Math.max(1, Math.floor(data.questionCount))
            : questionCount;

      const resolvedTestId =
        typeof data?.testId === "string" &&
        data.testId.trim().length > 0 &&
        isUuid(data.testId.trim())
          ? data.testId.trim()
          : buildClientUuid();
      const resolvedSelectedTopics =
        Array.isArray(data?.selectedTopics) && data.selectedTopics.length > 0
          ? data.selectedTopics
          : selectedTopicsPayload;

      const quickTestPayload: QuickTestSessionPayload = {
        testId: resolvedTestId,
        oppositionId: oposicionActiva.id,
        oppositionName: oposicionActiva.nombre,
        questionCount: generatedQuestionCount,
        selectedTopics: resolvedSelectedTopics,
        questions: Array.isArray(data?.questions) ? data.questions : []
      };

      setQuickTestSessionPayload(quickTestPayload);
      await upsertQuickTestSession({
        userId: user.id,
        oppositionId: oposicionActiva.id,
        payload: quickTestPayload
      });

      toast({
        title:
          mode === "mock"
            ? t("test.toasts.mockReadyTitle")
            : t("test.toasts.quickTestReadyTitle"),
        description:
          mode === "mock"
            ? t("test.toasts.mockReadyDescription", {
                opposition: oposicionActiva.nombre
              })
            : t("test.toasts.quickTestReadyDescription", {
                topicCount: resolvedSelectedTopics.length,
                questionCount: generatedQuestionCount
              })
      });
      setIsQuickTestDialogOpen(false);
      navigate(`/perfil/test/${encodeURIComponent(resolvedTestId)}`, {
        state: {
          quickTest: quickTestPayload
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("quick_test_question_limit_exceeded") ||
          error.message.includes("quick_test_requires_paid_plan"))
      ) {
        if (mode === "quick") setQuickTestQuestionCount(quickTestQuestionLimit);
        setIsUpgradeDialogOpen(true);
      }

      toast({
        variant: "destructive",
        title:
          mode === "mock"
            ? t("test.toasts.mockFailedTitle")
            : t("test.toasts.quickTestFailedTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : mode === "mock"
              ? t("test.toasts.mockFailedDescription")
              : t("test.toasts.quickTestFailedDescription")
      });
    } finally {
      setIsGeneratingQuickTest(false);
    }
  };

  const iniciarSimulacro = async (forceNew = false) => {
    const officialQuestionCount = mockExamConfig?.questionCount ?? null;
    const officialDurationMinutes = mockExamConfig?.durationMinutes ?? null;

    if (!officialQuestionCount || !officialDurationMinutes) {
      toast({
        variant: "destructive",
        title: t("test.toasts.mockFailedTitle"),
        description: t("test.toasts.mockFailedDescription")
      });
      return;
    }

    await launchGeneratedTest({
      mode: "mock",
      forceNew,
      questionCount: officialQuestionCount,
      selectedTopicsPayload: quickBlocks.map(
        (block): QuickTestTopicSelection => ({
          id: block.code,
          label: block.displayTitle || block.title,
          scope: "block"
        })
      )
    });
  };

  const iniciarTestRapido = async (forceNew = false) => {
    if (selectedTopicIds.length === 0) {
      toast({
        variant: "destructive",
        title: t("test.toasts.selectTopicTitle"),
        description: t("test.toasts.selectTopicsDescription")
      });
      return;
    }

    if (quickTestQuestionCount > quickTestQuestionLimit) {
      setQuickTestQuestionCount(quickTestQuestionLimit);
      return;
    }

    if (quickTestQuestionCount < minimumQuestionCount) {
      setQuickTestQuestionCount(minimumQuestionCount);
      toast({
        variant: "destructive",
        title: t("test.quickDialogMinQuestionsTitle", {
          defaultValue: "Mínimo de preguntas insuficiente"
        }),
        description: t("test.quickDialogMinQuestionsDescription", {
          defaultValue:
            "Debes pedir al menos {{count}} preguntas para cubrir los {{count}} temas seleccionados.",
          count: minimumQuestionCount
        })
      });
      return;
    }

    await launchGeneratedTest({
      mode: "quick",
      forceNew,
      questionCount: quickTestQuestionCount,
      selectedTopicsPayload: buildSelectedTopicsPayload(selectedTopicIds)
    });
  };

  const toggleTopicSelection = (topicId: string, shouldSelect: boolean) => {
    setSelectedTopicIds((prev) => {
      const nextSelection = new Set(prev);
      if (shouldSelect) nextSelection.add(topicId);
      else nextSelection.delete(topicId);
      return Array.from(nextSelection);
    });
  };

  const toggleBlockSelection = (topicIds: string[], shouldSelect: boolean) => {
    setSelectedTopicIds((prev) => {
      const nextSelection = new Set(prev);
      topicIds.forEach((topicId) => {
        if (shouldSelect) nextSelection.add(topicId);
        else nextSelection.delete(topicId);
      });
      return Array.from(nextSelection);
    });
  };

  const onQuickTestDialogOpenChange = (open: boolean) => {
    if (isGeneratingQuickTest) return;
    setIsQuickTestDialogOpen(open);
  };
  const handleResumeInProgressTest = () => {
    if (!inProgressTest?.testId) return;
    setIsInProgressDialogOpen(false);
    setIsQuickTestDialogOpen(false);
    navigate(`/perfil/test/${encodeURIComponent(inProgressTest.testId)}`);
  };

  if (isLoadingOpposition) return <ProfileTestPageSkeleton />;

  if (!isCurrentPlanPaid) {
    return (
      <div className="space-y-4">
        <section className={sectionClassName}>
          <p className="mb-1 text-xs font-semibold tracking-[0.22em] uppercase text-muted-foreground">
            {t("test.badge")}
          </p>
          <h2 className="mb-2 text-xl font-serif text-foreground md:text-2xl">
            {t("test.title")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("test.description")}
          </p>
          <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <span className="font-semibold uppercase tracking-[0.22em]">
              {t(`plans:plans.${currentPlanKey}.name`)}
            </span>
            <span className="text-current/80">{t("test.planSummaryFree")}</span>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase text-muted-foreground">
              {t("testSession.badge")}
            </p>
            <h3 className="text-xl font-serif text-foreground">
              {t("testSession.lockedTitle")}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("testSession.lockedDescription")}
            </p>
            <CustomButton asChild radius="full" styleType="primary">
              <Link to="/perfil/planes">{t("plans:upgradeDialog.cta")}</Link>
            </CustomButton>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={sectionClassName}>
        <p className="mb-1 text-xs font-semibold tracking-[0.22em] uppercase text-muted-foreground">
          {t("test.badge")}
        </p>
        <h2 className="mb-2 text-xl font-serif text-foreground md:text-2xl">
          {t("test.title")}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("test.description")}
        </p>
        <div
          className={`mt-4 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-xs ${
            isCurrentPlanPaid
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-amber-500/25 bg-amber-500/10 text-amber-700"
          }`}
        >
          <span className="font-semibold uppercase tracking-[0.22em]">
            {t(`plans:plans.${currentPlanKey}.name`)}
          </span>
          <span className="text-current/80">
            {isCurrentPlanPaid
              ? t("test.planSummaryPro", {
                  quickTestLimit: quickTestQuestionLimit
                })
              : t("test.planSummaryFree")}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${optionPanelClassName} flex h-full flex-col`}>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-foreground">
                {t("test.mockMode")}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("test.activeOpposition", {
                opposition: oposicionActiva.nombre
              })}
            </p>
            {mockExamConfig?.questionCount &&
              mockExamConfig?.durationMinutes && (
                <p className="text-xs text-muted-foreground">
                  {t("test.mockOfficialSummary", {
                    questionCount: mockExamConfig.questionCount,
                    durationMinutes: mockExamConfig.durationMinutes
                  })}
                </p>
              )}
          </div>
          <CustomButton
            type="button"
            onClick={() => {
              void iniciarSimulacro();
            }}
            styleType="menu"
            radius="full"
            className="mt-auto w-full"
            disabled={
              isGeneratingQuickTest ||
              !mockExamConfig?.questionCount ||
              !mockExamConfig?.durationMinutes ||
              quickBlocks.length === 0
            }
          >
            {t("test.startMock")}
          </CustomButton>
        </div>

        <div className={`${optionPanelClassName} space-y-5`}>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ListChecks className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {t("test.quickMode")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("test.selectTopicOf", { opposition: oposicionActiva.nombre })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("test.quickSelectionSummary", {
              topicCount: selectedTopicIds.length,
              questionCount: quickTestQuestionCount
            })}
          </p>
          {selectedTopicLabels.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedTopicLabels.slice(0, 3).join(" · ")}
              {selectedTopicLabels.length > 3 ? " · …" : ""}
            </p>
          )}
          <CustomButton
            type="button"
            onClick={() => {
              if (!isCurrentPlanPaid) {
                setIsUpgradeDialogOpen(true);
                return;
              }
              setIsQuickTestDialogOpen(true);
            }}
            styleType="primary"
            radius="full"
            className="w-full"
            disabled={allTopicIds.length === 0}
          >
            {t("test.launchQuickTest")}
            <ArrowRight className="h-4 w-4" />
          </CustomButton>
        </div>
      </section>

      <Dialog
        open={isQuickTestDialogOpen}
        onOpenChange={onQuickTestDialogOpenChange}
      >
        <DialogContent className="max-w-3xl overflow-hidden rounded-[1.75rem] border-border/70 bg-background/95 p-0 shadow-[0_28px_64px_-44px_rgba(15,23,42,0.42)]">
          <DialogHeader className="border-b border-border/70 bg-secondary/20 px-6 pt-6 pb-4 text-left">
            <DialogTitle className="text-base font-semibold leading-tight">
              {t("test.quickDialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {t("test.quickDialogDescription", {
                opposition: oposicionActiva.nombre
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[68vh] space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {t("test.quickDialogQuestionsLabel")}
                </p>
                <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold text-foreground">
                  {quickTestQuestionCount}
                </span>
              </div>
              <Slider
                min={minimumQuestionCount}
                max={Math.min(QUICK_TEST_MAX_QUESTIONS, quickTestQuestionLimit)}
                step={1}
                value={[quickTestQuestionCount]}
                disabled={isGeneratingQuickTest}
                onValueChange={(value) => {
                  const nextCount = value[0] ?? minimumQuestionCount;
                  const normalizedCount = Math.min(
                    Math.min(QUICK_TEST_MAX_QUESTIONS, quickTestQuestionLimit),
                    Math.max(minimumQuestionCount, nextCount)
                  );
                  setQuickTestQuestionCount(normalizedCount);
                }}
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{minimumQuestionCount}</span>
                <span>
                  {Math.min(QUICK_TEST_MAX_QUESTIONS, quickTestQuestionLimit)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("test.quickDialogQuestionsHint", {
                  planLimit: quickTestQuestionLimit
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("test.quickDialogMinimumCoverageHint", {
                  defaultValue:
                    "El mínimo se ajusta automáticamente a {{count}} para asegurar al menos una pregunta por tema seleccionado.",
                  count: minimumQuestionCount
                })}
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {t("test.quickDialogBlocksLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("test.quickDialogSelectedCount", {
                    count: selectedTopicIds.length
                  })}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <CustomButton
                  type="button"
                  size="sm"
                  styleType="ghost"
                  onClick={() => setSelectedTopicIds(allTopicIds)}
                  disabled={allTopicIds.length === 0 || isGeneratingQuickTest}
                >
                  {t("test.quickDialogSelectAll")}
                </CustomButton>
                <CustomButton
                  type="button"
                  size="sm"
                  styleType="ghost"
                  onClick={() => setSelectedTopicIds([])}
                  disabled={
                    selectedTopicIds.length === 0 || isGeneratingQuickTest
                  }
                >
                  {t("test.quickDialogClear")}
                </CustomButton>
              </div>

              {quickBlocks.length === 0 && (
                <p className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
                  {t("test.quickDialogNoTopics")}
                </p>
              )}

              <div className="space-y-3">
                {quickBlocks.map((block) => {
                  const blockTopicIds = block.topics.map((topic) => topic.id);
                  const selectedCount = blockTopicIds.reduce(
                    (acc, topicId) =>
                      acc + (selectedTopicIdSet.has(topicId) ? 1 : 0),
                    0
                  );
                  const blockCheckedState: boolean | "indeterminate" =
                    selectedCount === 0
                      ? false
                      : selectedCount === blockTopicIds.length
                        ? true
                        : "indeterminate";

                  return (
                    <div
                      key={block.code}
                      className={`rounded-[1.25rem] border px-4 py-4 shadow-sm transition-colors ${
                        selectedCount > 0
                          ? "border-primary/20 bg-primary/[0.04]"
                          : "border-border/70 bg-background/90"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox
                          checked={blockCheckedState}
                          onCheckedChange={(checked) =>
                            toggleBlockSelection(
                              blockTopicIds,
                              checked === true
                            )
                          }
                          disabled={isGeneratingQuickTest}
                          className="mt-0.5"
                        />
                        <span className="flex flex-col gap-1">
                          <span className="text-sm font-semibold leading-tight text-foreground">
                            {block.displayTitle}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("test.quickDialogBlockCount", {
                              selected: selectedCount,
                              total: blockTopicIds.length
                            })}
                          </span>
                        </span>
                      </label>

                      <div className="mt-3 grid gap-2 pl-7">
                        {block.topics.map((topic) => (
                          <label
                            key={topic.id}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2 transition-colors hover:bg-secondary/20"
                          >
                            <Checkbox
                              checked={selectedTopicIdSet.has(topic.id)}
                              onCheckedChange={(checked) =>
                                toggleTopicSelection(topic.id, checked === true)
                              }
                              disabled={isGeneratingQuickTest}
                              className="mt-0.5"
                            />
                            <span className="text-xs leading-relaxed text-foreground">
                              {topic.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-border/70 bg-secondary/20 px-6 py-4 sm:justify-end">
            <CustomButton
              type="button"
              styleType="menu"
              radius="full"
              onClick={() => setIsQuickTestDialogOpen(false)}
              disabled={isGeneratingQuickTest}
            >
              {t("test.quickDialogCancel")}
            </CustomButton>
            <CustomButton
              type="button"
              styleType="primary"
              radius="full"
              onClick={() => {
                void iniciarTestRapido();
              }}
              disabled={selectedTopicIds.length === 0 || isGeneratingQuickTest}
            >
              {isGeneratingQuickTest
                ? t("test.quickDialogGenerating")
                : t("test.quickDialogStart")}
              {isGeneratingQuickTest ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </CustomButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlanUpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={setIsUpgradeDialogOpen}
        feature="quick-test"
        currentPlanName={t(`plans:plans.${currentPlanKey}.name`)}
        currentLimit={quickTestQuestionLimit}
        targetLimit={100}
      />

      <Dialog
        open={isInProgressDialogOpen}
        onOpenChange={(open) => {
          if (!isGeneratingQuickTest) setIsInProgressDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-[42rem] overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_62%,hsl(var(--secondary)/0.24)_100%)] p-0 shadow-[0_34px_80px_-48px_rgba(15,23,42,0.42)] dark:shadow-[0_34px_80px_-52px_rgba(0,0,0,0.58)]">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />

          <div className="space-y-6 px-6 py-6 md:px-7 md:py-7">
            <DialogHeader className="space-y-3 text-left">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                <RotateCcw className="h-4 w-4" />
              </div>
              <DialogTitle className="text-xl font-serif leading-tight text-foreground">
                {t("test.inProgressDialogTitle")}
              </DialogTitle>
              <DialogDescription className="max-w-md text-sm leading-6 text-muted-foreground">
                {t("test.inProgressDialogHelper")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.35rem] border border-border/65 bg-background/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5 text-primary/80" />
                  <span>{t("test.inProgressDialogLastActivityLabel")}</span>
                </div>
                <p className="mt-3 text-sm font-medium leading-5 text-foreground">
                  {inProgressTest?.lastInteractionAt &&
                  Number.isFinite(
                    new Date(inProgressTest.lastInteractionAt).valueOf()
                  )
                    ? new Date(
                        inProgressTest.lastInteractionAt
                      ).toLocaleString()
                    : "-"}
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-border/65 bg-background/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5 text-primary/80" />
                  <span>{t("test.inProgressDialogPendingQuestionsLabel")}</span>
                </div>
                <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                  {inProgressPendingQuestions}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">
                    / {inProgressTest?.questionCount ?? 0}
                  </span>
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-border/65 bg-background/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5 text-primary/80" />
                  <span>{t("test.inProgressDialogRemainingTimeLabel")}</span>
                </div>
                <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                  {inProgressRemainingTime}
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CustomButton
                type="button"
                styleType="ghost"
                radius="full"
                className="w-full sm:w-auto"
                onClick={() => setIsInProgressDialogOpen(false)}
                disabled={isGeneratingQuickTest}
              >
                {t("test.inProgressDialogCancel")}
              </CustomButton>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <CustomButton
                  type="button"
                  styleType="menu"
                  radius="full"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    void (async () => {
                      setIsInProgressDialogOpen(false);
                      await (pendingLaunchMode === "mock"
                        ? iniciarSimulacro(true)
                        : iniciarTestRapido(true));
                    })();
                  }}
                  disabled={isGeneratingQuickTest}
                >
                  {isGeneratingQuickTest ? (
                    <>
                      {t("test.quickDialogGenerating")}
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </>
                  ) : (
                    t("test.inProgressDialogConfirm")
                  )}
                </CustomButton>
                <CustomButton
                  type="button"
                  styleType="primary"
                  radius="full"
                  className="w-full sm:w-auto"
                  onClick={handleResumeInProgressTest}
                  disabled={isGeneratingQuickTest}
                >
                  {t("test.inProgressDialogResume")}
                </CustomButton>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfileTest;
