import { useAuth } from "@/auth/AuthProvider";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
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
import { setQuickTestSessionPayload } from "@/lib/quickTestStorage";
import { usePreferredOppositionQuery } from "@/queries/profileQueries";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  fetchLatestInProgressQuickTest,
  fetchReusableQuickTestSession,
  generateQuickTest,
  isUuid,
  upsertQuickTestSession,
  type InProgressQuickTestSummary,
  type QuickTestSessionPayload
} from "@/queries/testQueries";
import { ArrowRight, FileText, ListChecks, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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

const ProfileTest = () => {
  const { t, i18n } = useTranslation(["profile"]);
  const { toast } = useToast();
  const navigate = useNavigate();
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
        const topicLabels =
          block.subtopics.length > 0 ? block.subtopics : [block.title];

        return {
          code: block.code,
          title: block.title,
          displayTitle: block.displayTitle,
          topics: topicLabels.map((label, idx) => ({
            id: `${block.code}:${idx}`,
            label
          }))
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

  useEffect(() => {
    setQuickTestQuestionCount((prev) => Math.min(prev, quickTestQuestionLimit));
  }, [quickTestQuestionLimit]);

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

  const iniciarSimulacro = () => {
    toast({
      title: t("test.toasts.mockReadyTitle"),
      description: t("test.toasts.mockReadyDescription", {
        opposition: oposicionActiva.nombre
      })
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

    if (!user?.id) {
      toast({
        variant: "destructive",
        title: t("test.toasts.missingSessionTitle"),
        description: t("test.toasts.missingSessionDescription")
      });
      return;
    }

    if (quickTestQuestionCount > quickTestQuestionLimit) {
      if (!isCurrentPlanPaid) {
        setIsUpgradeDialogOpen(true);
        return;
      }
    }

    if (!forceNew) {
      try {
        const existingAttempt = await fetchLatestInProgressQuickTest(user.id);
        if (existingAttempt) {
          setInProgressTest(existingAttempt);
          setIsInProgressDialogOpen(true);
          return;
        }
      } catch (error) {
        console.error("[quick-test] check in-progress failed", error);
      }
    }

    const selectedTopicsPayload = selectedTopicIds.map((topicId) => ({
      id: topicId,
      label: topicLabelById.get(topicId) ?? topicId
    }));

    setIsGeneratingQuickTest(true);

    try {
      const reusableQuickTest = await fetchReusableQuickTestSession({
        userId: user.id,
        oppositionId: oposicionActiva.id,
        questionCount: quickTestQuestionCount,
        selectedTopics: selectedTopicsPayload
      });

      if (reusableQuickTest) {
        setQuickTestSessionPayload(reusableQuickTest);
        toast({
          title: t("test.toasts.quickTestReadyTitle"),
          description: t("test.toasts.quickTestReadyDescription", {
            topicCount: reusableQuickTest.selectedTopics.length,
            questionCount: reusableQuickTest.questionCount,
            testId: reusableQuickTest.testId
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

      const data = await generateQuickTest({
        oppositionId: oposicionActiva.id,
        oppositionName: oposicionActiva.nombre,
        questionCount: quickTestQuestionCount,
        locale: i18n.resolvedLanguage ?? "es",
        selectedTopics: selectedTopicsPayload
      });

      const generatedQuestionCount =
        Array.isArray(data?.questions) && data.questions.length > 0
          ? data.questions.length
          : typeof data?.questionCount === "number" &&
              Number.isFinite(data.questionCount)
            ? Math.max(1, Math.floor(data.questionCount))
            : quickTestQuestionCount;

      const resolvedTestId =
        typeof data?.testId === "string" &&
        data.testId.trim().length > 0 &&
        isUuid(data.testId.trim())
          ? data.testId.trim()
          : buildClientUuid();

      const quickTestPayload: QuickTestSessionPayload = {
        testId: resolvedTestId,
        oppositionName: oposicionActiva.nombre,
        questionCount: generatedQuestionCount,
        selectedTopics: selectedTopicsPayload,
        questions: Array.isArray(data?.questions) ? data.questions : []
      };

      setQuickTestSessionPayload(quickTestPayload);
      await upsertQuickTestSession({
        userId: user.id,
        oppositionId: oposicionActiva.id,
        payload: quickTestPayload
      });

      toast({
        title: t("test.toasts.quickTestReadyTitle"),
        description: t("test.toasts.quickTestReadyDescription", {
          topicCount: selectedTopicIds.length,
          questionCount: generatedQuestionCount,
          testId: resolvedTestId
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
        error.message.includes("quick_test_question_limit_exceeded")
      ) {
        setQuickTestQuestionCount(quickTestQuestionLimit);
        if (!isCurrentPlanPaid) setIsUpgradeDialogOpen(true);
      }

      toast({
        variant: "destructive",
        title: t("test.toasts.quickTestFailedTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("test.toasts.quickTestFailedDescription")
      });
    } finally {
      setIsGeneratingQuickTest(false);
    }
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
        <div
          className={`mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${
            isCurrentPlanPaid
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-amber-500/25 bg-amber-500/10 text-amber-700"
          }`}
        >
          <span className="font-semibold uppercase tracking-[0.22em]">
            {t(`plans:plans.${currentPlanKey}.name`)}
          </span>
          <span className="text-current/80">
            {t("test.planSummary", {
              quickTestLimit: quickTestQuestionLimit
            })}
          </span>
        </div>
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
          <p className="text-xs text-muted-foreground">
            {t("test.quickSelectionSummary", {
              topicCount: selectedTopicIds.length,
              questionCount: quickTestQuestionCount
            })}
          </p>
          <CustomButton
            type="button"
            onClick={() => setIsQuickTestDialogOpen(true)}
            styleType="primary"
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
        <DialogContent className="max-w-3xl border-border/70 bg-background/95 p-0">
          <DialogHeader className="border-b border-border/70 bg-primary/10 px-6 pt-6 pb-4 text-left">
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
                <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">
                  {quickTestQuestionCount}
                </span>
              </div>
              <Slider
                min={QUICK_TEST_MIN_QUESTIONS}
                max={QUICK_TEST_MAX_QUESTIONS}
                step={1}
                value={[quickTestQuestionCount]}
                disabled={isGeneratingQuickTest}
                onValueChange={(value) => {
                  const nextCount = value[0] ?? QUICK_TEST_MIN_QUESTIONS;
                  const normalizedCount = Math.min(
                    QUICK_TEST_MAX_QUESTIONS,
                    Math.max(QUICK_TEST_MIN_QUESTIONS, nextCount)
                  );

                  if (normalizedCount > quickTestQuestionLimit) {
                    setQuickTestQuestionCount(quickTestQuestionLimit);
                    if (!isCurrentPlanPaid) setIsUpgradeDialogOpen(true);
                    return;
                  }

                  setQuickTestQuestionCount(normalizedCount);
                }}
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{QUICK_TEST_MIN_QUESTIONS}</span>
                <span>{QUICK_TEST_MAX_QUESTIONS}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("test.quickDialogQuestionsHint", {
                  planLimit: quickTestQuestionLimit
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
                <p className="rounded-lg border border-border/70 bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
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
                      className="rounded-xl border border-border/80 bg-background px-4 py-3"
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
                            className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-primary/10 px-2 py-1.5"
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

          <DialogFooter className="border-t border-border/70 bg-primary/10 px-6 py-4 sm:justify-end">
            <CustomButton
              type="button"
              styleType="menu"
              onClick={() => setIsQuickTestDialogOpen(false)}
              disabled={isGeneratingQuickTest}
            >
              {t("test.quickDialogCancel")}
            </CustomButton>
            <CustomButton
              type="button"
              styleType="primary"
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

      <ConfirmActionDialog
        open={isInProgressDialogOpen}
        onOpenChange={setIsInProgressDialogOpen}
        title={t("test.inProgressDialogTitle")}
        description={t("test.inProgressDialogDescription", {
          answeredCount: inProgressTest?.answeredCount ?? 0,
          lastInteraction:
            inProgressTest?.lastInteractionAt &&
            Number.isFinite(
              new Date(inProgressTest.lastInteractionAt).valueOf()
            )
              ? new Date(inProgressTest.lastInteractionAt).toLocaleString()
              : "-"
        })}
        confirmLabel={t("test.inProgressDialogConfirm")}
        cancelLabel={t("test.inProgressDialogCancel")}
        isLoading={isGeneratingQuickTest}
        onConfirm={async () => {
          setIsInProgressDialogOpen(false);
          await iniciarTestRapido(true);
        }}
      />
    </div>
  );
};

export default ProfileTest;
