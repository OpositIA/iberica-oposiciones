import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import ConfirmActionDialog from "@/components/ConfirmActionDialog";
import CustomButton from "@/components/ui/custom-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { isPaidPlan } from "@/lib/plans";
import {
  clearQuickTestProgress,
  getQuickTestProgress,
  getQuickTestSessionPayload,
  setQuickTestProgress,
  setQuickTestSessionPayload
} from "@/lib/quickTestStorage";
import { runSingleFlight } from "@/lib/singleFlight";
import { cn } from "@/lib/utils";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  cloneQuickTestSession,
  ensureQuickTestAttempt,
  evaluateQuickTestAttempt,
  fetchCurrentOppositionPrimaryTestExamConfig,
  fetchQuickTestSessionById,
  isUuid,
  resetQuickTestAttempt,
  saveQuickTestAttemptProgress,
  type OppositionTestExamConfig,
  type QuickTestSessionPayload
} from "@/queries/testQueries";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleHelp, RotateCcw } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  UNSAFE_NavigationContext,
  useBeforeUnload,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";

type QuickTestLocationState = {
  quickTest?: QuickTestSessionPayload;
};

type NormalizedQuestion = {
  id: string;
  statement: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  sources: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickString = (
  record: Record<string, unknown>,
  keys: string[]
): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0)
      return value.trim();
  }
  return null;
};

const normalizeOption = (input: unknown): string | null => {
  if (typeof input === "string" && input.trim().length > 0) return input.trim();
  if (!isRecord(input)) return null;
  return pickString(input, ["text", "label", "content", "option", "answer"]);
};

const normalizeOptions = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map((item) => normalizeOption(item))
      .filter((value): value is string => Boolean(value));
  }

  if (!isRecord(input)) return [];

  const letterKeys = Object.keys(input).filter((key) => /^[A-D]$/i.test(key));
  if (letterKeys.length > 0) {
    return letterKeys
      .sort((a, b) => a.localeCompare(b))
      .map((key) => normalizeOption(input[key]))
      .filter((value): value is string => Boolean(value));
  }

  return Object.values(input)
    .map((value) => normalizeOption(value))
    .filter((value): value is string => Boolean(value));
};

const normalizeCorrectIndex = (
  input: unknown,
  optionCount: number,
  options: string[],
  optionIds: string[] = []
): number | null => {
  if (typeof input === "number" && Number.isFinite(input)) {
    const parsed = Math.floor(input);
    if (parsed >= 0 && parsed < optionCount) return parsed;
    if (parsed >= 1 && parsed <= optionCount) return parsed - 1;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const byOptionId = optionIds.findIndex(
      (id) => id.toLowerCase() === trimmed.toLowerCase()
    );
    if (byOptionId >= 0) return byOptionId;

    const asNumber = Number.parseInt(trimmed, 10);
    if (Number.isFinite(asNumber)) {
      if (asNumber >= 0 && asNumber < optionCount) return asNumber;
      if (asNumber >= 1 && asNumber <= optionCount) return asNumber - 1;
    }

    if (/^[A-Z]$/i.test(trimmed)) {
      const idx = trimmed.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
      if (idx >= 0 && idx < optionCount) return idx;
    }

    const byText = options.findIndex(
      (option) => option.toLowerCase() === trimmed.toLowerCase()
    );
    if (byText >= 0) return byText;
  }

  return null;
};

const normalizeSources = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string" && item.trim().length > 0)
        return item.trim();
      if (!isRecord(item)) return null;
      const idBoe = pickString(item, ["id_boe", "idBoe"]);
      const article = pickString(item, ["articulo", "article", "article_num"]);
      const url = pickString(item, ["url", "url_norma"]);
      const compact = [idBoe, article, url].filter(Boolean).join(" - ");
      return compact.length > 0 ? compact : null;
    })
    .filter((value): value is string => Boolean(value));
};

const normalizeQuestion = (
  raw: unknown,
  idx: number,
  fallbackStatement: string
): NormalizedQuestion | null => {
  if (!isRecord(raw)) return null;

  const rawOptions =
    raw.options ?? raw.choices ?? raw.answers ?? raw.alternatives;
  const options = normalizeOptions(rawOptions);
  if (options.length === 0) return null;
  const optionIds =
    Array.isArray(rawOptions) && rawOptions.length > 0
      ? rawOptions
          .map((option) => {
            if (!isRecord(option)) return null;
            const value = option.id ?? option.optionId ?? option.value;
            return typeof value === "string" ? value.trim() : null;
          })
          .filter((value): value is string => Boolean(value))
      : [];

  const statement =
    pickString(raw, [
      "question",
      "enunciado",
      "statement",
      "prompt",
      "text",
      "title"
    ]) ?? fallbackStatement;

  const correctRaw =
    raw.correctOptionIndex ??
    raw.correct_index ??
    raw.correctAnswerIndex ??
    raw.answerIndex ??
    raw.correctOptionId ??
    raw.correct_option_id ??
    raw.correct ??
    raw.correctOption ??
    raw.correct_answer ??
    raw.correctAnswer;

  const correctIndex = normalizeCorrectIndex(
    correctRaw,
    options.length,
    options,
    optionIds
  );
  const id =
    pickString(raw, ["id", "questionId", "uid"]) ?? `question-${idx + 1}`;
  const explanation =
    pickString(raw, ["explanation", "explicacion", "justification"]) ?? "";
  const sources = normalizeSources(
    raw.sources ?? raw.references ?? raw.citations ?? raw.sourceRefs
  );

  return {
    id,
    statement,
    options,
    correctIndex,
    explanation,
    sources
  };
};

const sanitizeSelectedAnswers = (
  source: Record<string, number> | null | undefined,
  questionById: Map<string, NormalizedQuestion>
) => {
  const normalized: Record<string, number> = {};
  if (!source) return normalized;

  Object.entries(source).forEach(([questionId, rawAnswerIdx]) => {
    if (typeof rawAnswerIdx !== "number" || !Number.isFinite(rawAnswerIdx))
      return;
    const question = questionById.get(questionId);
    if (!question) return;
    const answerIdx = Math.floor(rawAnswerIdx);
    if (answerIdx < 0 || answerIdx >= question.options.length) return;
    normalized[questionId] = answerIdx;
  });

  return normalized;
};

type BrowserNavigationBlockTx = {
  retry: () => void;
};

const useBrowserNavigationBlocker = (
  when: boolean,
  onBlock: (tx: BrowserNavigationBlockTx) => void
) => {
  const navigationContext = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    if (!when) return;

    const navigator = navigationContext.navigator as
      | {
          block?: (
            blocker: (tx: BrowserNavigationBlockTx) => void
          ) => () => void;
        }
      | undefined;

    if (!navigator || typeof navigator.block !== "function") return;

    const unblock = navigator.block((tx: BrowserNavigationBlockTx) => {
      onBlock({
        ...tx,
        retry() {
          unblock();
          tx.retry();
        }
      });
    });

    return unblock;
  }, [navigationContext, onBlock, when]);
};

const ProfileQuickTestSession = () => {
  const { t } = useTranslation(["profile", "plans"]);
  const { user, isAuthReady } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const hasQuickTestsAccess = isPaidPlan(planState);
  const { testId: routeTestId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const ensuredAttemptForTestRef = useRef<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, number>
  >({});
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isAttemptHydrated, setIsAttemptHydrated] = useState(false);
  const [isHydratingAttempt, setIsHydratingAttempt] = useState(false);
  const [attemptStartedAt, setAttemptStartedAt] = useState<string | null>(null);
  const [attemptFinishedAt, setAttemptFinishedAt] = useState<string | null>(
    null
  );
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isInternalNavigation, setIsInternalNavigation] = useState(false);
  const [blockedTransition, setBlockedTransition] =
    useState<BrowserNavigationBlockTx | null>(null);
  const locationState = location.state as QuickTestLocationState | null;

  const initialPayload = useMemo(() => {
    const fromState = locationState?.quickTest;
    if (fromState && fromState.testId === routeTestId) return fromState;
    return getQuickTestSessionPayload(routeTestId);
  }, [locationState?.quickTest, routeTestId]);

  const [payload, setPayload] = useState<QuickTestSessionPayload | null>(
    initialPayload
  );
  const [isLoadingPayload, setIsLoadingPayload] = useState(!initialPayload);
  const [testExamConfig, setTestExamConfig] =
    useState<OppositionTestExamConfig | null>(null);

  useEffect(() => {
    setPayload(initialPayload);
    setIsLoadingPayload(!initialPayload);
    setSelectedAnswers({});
    setActiveQuestionId(null);
    setAttemptStartedAt(null);
    setAttemptFinishedAt(null);
    setIsResultDialogOpen(false);
    setIsInternalNavigation(false);
    setIsHydratingAttempt(false);
    setIsAttemptHydrated(false);
    ensuredAttemptForTestRef.current = null;
    lastSavedSignatureRef.current = null;
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
  }, [initialPayload, routeTestId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.id || !routeTestId || !isUuid(routeTestId)) {
      setIsLoadingPayload(false);
      return;
    }
    if (payload?.testId === routeTestId) {
      setIsLoadingPayload(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingPayload(true);

    const loadPayloadFromDb = async () => {
      try {
        const dbPayload = await runSingleFlight(
          `quick-test:payload:${routeTestId}:${user.id}`,
          () => fetchQuickTestSessionById(routeTestId, user.id),
          { reuseResultForMs: 1200 }
        );
        if (!dbPayload || isCancelled) return;
        setPayload(dbPayload);
        setQuickTestSessionPayload(dbPayload);
      } catch {
        return;
      } finally {
        if (!isCancelled) setIsLoadingPayload(false);
      }
    };

    void loadPayloadFromDb();

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, payload?.testId, routeTestId, user?.id]);

  useEffect(() => {
    let isCancelled = false;
    const oppositionId = payload?.oppositionId ?? null;

    if (!oppositionId) {
      setTestExamConfig(null);
      return;
    }

    void fetchCurrentOppositionPrimaryTestExamConfig(oppositionId)
      .then((config) => {
        if (!isCancelled) setTestExamConfig(config);
      })
      .catch(() => {
        if (!isCancelled) setTestExamConfig(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [payload?.oppositionId]);

  const questions = useMemo(
    () =>
      (payload?.questions ?? [])
        .map((raw, idx) =>
          normalizeQuestion(
            raw,
            idx,
            t("testSession.questionFallback", { index: idx + 1 })
          )
        )
        .filter((question): question is NormalizedQuestion =>
          Boolean(question)
        ),
    [payload?.questions, t]
  );

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions]
  );

  useEffect(() => {
    const savedProgress = routeTestId
      ? getQuickTestProgress(routeTestId)
      : null;
    const savedSelectedAnswers = sanitizeSelectedAnswers(
      savedProgress?.selectedAnswers,
      questionById
    );

    setSelectedAnswers(savedSelectedAnswers);

    if (questions.length === 0) {
      setActiveQuestionId(null);
      return;
    }

    const savedActiveQuestionId = savedProgress?.activeQuestionId;
    if (savedActiveQuestionId && questionById.has(savedActiveQuestionId)) {
      setActiveQuestionId(savedActiveQuestionId);
      return;
    }

    setActiveQuestionId(questions[0]?.id ?? null);
  }, [questionById, questions, routeTestId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.id || !routeTestId || !isUuid(routeTestId)) {
      setIsAttemptHydrated(true);
      return;
    }
    if (questions.length === 0) return;
    if (ensuredAttemptForTestRef.current === routeTestId) {
      setIsAttemptHydrated(true);
      return;
    }

    let isCancelled = false;
    setIsHydratingAttempt(true);

    const hydrateAttempt = async () => {
      try {
        const attempt = await runSingleFlight(
          `quick-test:attempt:${routeTestId}:${user.id}`,
          () =>
            ensureQuickTestAttempt({
              testId: routeTestId,
              userId: user.id,
              initialActiveQuestionId: questions[0]?.id ?? null
            }),
          { reuseResultForMs: 800 }
        );
        if (isCancelled) return;

        ensuredAttemptForTestRef.current = routeTestId;
        setAttemptStartedAt(attempt?.startedAt ?? null);
        setAttemptFinishedAt(attempt?.finishedAt ?? null);

        const dbAnswers = sanitizeSelectedAnswers(
          attempt?.selectedAnswers,
          questionById
        );
        const restoredActiveQuestionId =
          attempt?.activeQuestionId &&
          questionById.has(attempt.activeQuestionId as string)
            ? attempt.activeQuestionId
            : (questions[0]?.id ?? null);

        setSelectedAnswers(dbAnswers);
        setActiveQuestionId(restoredActiveQuestionId);
        lastSavedSignatureRef.current = JSON.stringify({
          selectedAnswers: dbAnswers,
          activeQuestionId: restoredActiveQuestionId ?? null,
          finishedAt: attempt?.finishedAt ?? null
        });
        setQuickTestProgress(routeTestId, {
          selectedAnswers: dbAnswers,
          activeQuestionId: restoredActiveQuestionId,
          updatedAt: attempt?.updatedAt ?? new Date().toISOString()
        });
      } catch {
        return;
      } finally {
        if (!isCancelled) {
          setIsHydratingAttempt(false);
          setIsAttemptHydrated(true);
        }
      }
    };

    void hydrateAttempt();

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, questionById, questions, routeTestId, user?.id]);

  useEffect(() => {
    if (!routeTestId || questions.length === 0) return;
    setQuickTestProgress(routeTestId, {
      selectedAnswers,
      activeQuestionId,
      updatedAt: new Date().toISOString()
    });
  }, [activeQuestionId, questions.length, routeTestId, selectedAnswers]);

  const evaluatedAttempt = useMemo(
    () => evaluateQuickTestAttempt(questions, selectedAnswers, testExamConfig),
    [questions, selectedAnswers, testExamConfig]
  );
  const answeredCount = evaluatedAttempt.answeredCount;
  const displayScore = useMemo(
    () =>
      Number.isInteger(evaluatedAttempt.score)
        ? String(evaluatedAttempt.score)
        : evaluatedAttempt.score.toFixed(1),
    [evaluatedAttempt.score]
  );
  const displayScoreScaleMax = useMemo(
    () =>
      Number.isInteger(evaluatedAttempt.scoreScaleMax)
        ? String(evaluatedAttempt.scoreScaleMax)
        : evaluatedAttempt.scoreScaleMax.toFixed(1),
    [evaluatedAttempt.scoreScaleMax]
  );
  const isReadOnlyHistoryView =
    !hasQuickTestsAccess && Boolean(attemptFinishedAt);
  const isMidTest =
    hasQuickTestsAccess &&
    questions.length > 0 &&
    answeredCount > 0 &&
    answeredCount < questions.length &&
    !attemptFinishedAt &&
    !isInternalNavigation;
  const onBlockedNavigation = useCallback((tx: BrowserNavigationBlockTx) => {
    setBlockedTransition(tx);
    setIsLeaveDialogOpen(true);
  }, []);
  useBrowserNavigationBlocker(isMidTest, onBlockedNavigation);

  useBeforeUnload((event) => {
    if (!isMidTest) return;
    event.preventDefault();
    event.returnValue = "";
  });

  useEffect(() => {
    if (!isAttemptHydrated) return;
    if (!user?.id || !routeTestId || !isUuid(routeTestId)) return;
    if (questions.length === 0) return;
    if (!hasQuickTestsAccess) return;

    const normalizedSelectedAnswers = sanitizeSelectedAnswers(
      selectedAnswers,
      questionById
    );
    const signature = JSON.stringify({
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId: activeQuestionId ?? null,
      finishedAt: attemptFinishedAt ?? null
    });
    if (lastSavedSignatureRef.current === signature) return;

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      void runSingleFlight(
        `quick-test:save:${routeTestId}:${user.id}:${signature}`,
        () =>
          saveQuickTestAttemptProgress({
            testId: routeTestId,
            userId: user.id,
            selectedAnswers: normalizedSelectedAnswers,
            activeQuestionId,
            finishedAt: attemptFinishedAt ?? undefined
          }),
        { reuseResultForMs: 400 }
      )
        .then(() => {
          lastSavedSignatureRef.current = signature;
        })
        .catch(() => {});
    }, 180);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [
    activeQuestionId,
    attemptFinishedAt,
    isAttemptHydrated,
    questionById,
    hasQuickTestsAccess,
    questions,
    routeTestId,
    selectedAnswers,
    user?.id
  ]);

  const getQuestionStatus = (question: NormalizedQuestion) => {
    const userAnswer = selectedAnswers[question.id];
    if (typeof userAnswer !== "number") return "unanswered";
    if (question.correctIndex === null) return "answered";
    return userAnswer === question.correctIndex ? "correct" : "wrong";
  };

  const goToQuestion = (questionId: string) => {
    setActiveQuestionId(questionId);
    const questionIndex = questions.findIndex(
      (question) => question.id === questionId
    );
    if (questionIndex < 0) return;

    const questionElement = document.getElementById(
      `quick-test-question-${questionIndex + 1}`
    );
    questionElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isAllAnswered =
    questions.length > 0 && answeredCount === questions.length;
  const wrongAnswers = evaluatedAttempt.wrongCount;
  const correctAnswers = evaluatedAttempt.correctCount;
  const blankAnswers = evaluatedAttempt.blankCount;

  const officialQuestionCount = testExamConfig?.questionCount ?? null;
  const extrapolatedScore = useMemo(() => {
    if (
      !officialQuestionCount ||
      officialQuestionCount <= 0 ||
      evaluatedAttempt.totalQuestions <= 0 ||
      officialQuestionCount === evaluatedAttempt.totalQuestions
    )
      return null;
    const ratio = officialQuestionCount / evaluatedAttempt.totalQuestions;
    const correctAnswerValue = testExamConfig?.correctAnswerValue ?? 1;
    const wrongAnswerPenalty = testExamConfig?.wrongAnswerPenalty ?? 0;
    const blankAnswerPenalty = testExamConfig?.blankAnswerPenalty ?? 0;
    const scoreMin = testExamConfig?.scoreMin ?? 0;
    const scoreMax = testExamConfig?.scoreMax ?? 10;
    const extCorrect = correctAnswers * ratio;
    const extWrong = wrongAnswers * ratio;
    const extBlank = Math.max(0, officialQuestionCount - extCorrect - extWrong);
    const maxRaw = officialQuestionCount * correctAnswerValue;
    const raw =
      extCorrect * correctAnswerValue -
      extWrong * wrongAnswerPenalty -
      extBlank * blankAnswerPenalty;
    const norm = maxRaw > 0 ? Math.max(0, Math.min(1, raw / maxRaw)) : 0;
    return scoreMin + norm * Math.max(0, scoreMax - scoreMin);
  }, [
    officialQuestionCount,
    evaluatedAttempt.totalQuestions,
    correctAnswers,
    wrongAnswers,
    testExamConfig
  ]);
  const displayExtrapolatedScore = useMemo(() => {
    if (extrapolatedScore === null) return null;
    return Number.isInteger(extrapolatedScore)
      ? String(extrapolatedScore)
      : extrapolatedScore.toFixed(1);
  }, [extrapolatedScore]);

  const handleRetry = async () => {
    if (isReadOnlyHistoryView) return;
    const firstQuestionId = questions[0]?.id ?? null;
    const nowIso = new Date().toISOString();
    const resetInPlace = async () => {
      if (routeTestId) {
        clearQuickTestProgress(routeTestId);
        setQuickTestProgress(routeTestId, {
          selectedAnswers: {},
          activeQuestionId: firstQuestionId,
          updatedAt: nowIso
        });
      }

      setSelectedAnswers({});
      setActiveQuestionId(firstQuestionId);
      setAttemptStartedAt(nowIso);
      setAttemptFinishedAt(null);
      lastSavedSignatureRef.current = null;

      if (!user?.id || !routeTestId || !isUuid(routeTestId)) return;

      try {
        const resetAttempt = await resetQuickTestAttempt({
          testId: routeTestId,
          userId: user.id,
          firstQuestionId
        });
        setAttemptStartedAt(resetAttempt?.startedAt ?? nowIso);
        setAttemptFinishedAt(resetAttempt?.finishedAt ?? null);
      } catch {
        return;
      }
    };

    if (!user?.id || !routeTestId || !isUuid(routeTestId)) {
      await resetInPlace();
      return;
    }

    setIsRetrying(true);

    try {
      // If user restarts mid-test, neutralize the current in-progress attempt.
      if (!attemptFinishedAt && answeredCount > 0) {
        await resetQuickTestAttempt({
          testId: routeTestId,
          userId: user.id,
          firstQuestionId
        });
      }

      const clonedPayload = await cloneQuickTestSession({
        sourceTestId: routeTestId,
        userId: user.id
      });
      if (!clonedPayload) throw new Error("quick-test clone failed");

      clearQuickTestProgress(routeTestId);
      setQuickTestSessionPayload(clonedPayload);
      setIsResultDialogOpen(false);
      setIsInternalNavigation(true);
      navigate(`/perfil/test/${encodeURIComponent(clonedPayload.testId)}`, {
        replace: true,
        state: { quickTest: clonedPayload }
      });
    } catch {
      await resetInPlace();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLeaveDialogOpenChange = (open: boolean) => {
    setIsLeaveDialogOpen(open);
    if (!open) setBlockedTransition(null);
  };

  const handleFinalizeTest = async () => {
    if (isReadOnlyHistoryView) return;
    if (!isAllAnswered || attemptFinishedAt) return;

    const finishedAtIso = new Date().toISOString();
    const normalizedSelectedAnswers = sanitizeSelectedAnswers(
      selectedAnswers,
      questionById
    );
    const signature = JSON.stringify({
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId: activeQuestionId ?? null,
      finishedAt: finishedAtIso
    });

    setAttemptFinishedAt(finishedAtIso);

    if (routeTestId) {
      setQuickTestProgress(routeTestId, {
        selectedAnswers: normalizedSelectedAnswers,
        activeQuestionId,
        updatedAt: finishedAtIso
      });
    }

    if (user?.id && routeTestId && isUuid(routeTestId)) {
      try {
        await saveQuickTestAttemptProgress({
          testId: routeTestId,
          userId: user.id,
          selectedAnswers: normalizedSelectedAnswers,
          activeQuestionId,
          finishedAt: finishedAtIso
        });
        lastSavedSignatureRef.current = signature;
      } catch {
        return;
      }
    }

    setIsResultDialogOpen(true);
  };

  const handleResultDialogOpenChange = (open: boolean) => {
    setIsResultDialogOpen(open);
    if (!open) {
      setIsInternalNavigation(true);
      void (async () => {
        if (user?.id) {
          await queryClient.invalidateQueries({
            queryKey: ["quick-tests", "dashboard-bundle", user.id]
          });
        }
        navigate("/dashboard");
      })();
    }
  };

  if (
    isAuthReady &&
    user?.id &&
    !hasQuickTestsAccess &&
    !isAttemptHydrated &&
    routeTestId &&
    isUuid(routeTestId)
  )
    return <AppLoading label={t("test.loading")} />;

  if (isAuthReady && user?.id && !hasQuickTestsAccess && !attemptFinishedAt) {
    return (
      <div className="border border-border bg-background p-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
          {t("profile:testSession.badge")}
        </p>
        <h1 className="text-xl font-serif text-foreground">
          {t("testSession.lockedTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("testSession.lockedDescription")}
        </p>
        <div className="mt-4">
          <CustomButton asChild styleType="primary">
            <Link to="/perfil/planes">{t("plans:upgradeDialog.cta")}</Link>
          </CustomButton>
        </div>
      </div>
    );
  }

  if (!payload && isLoadingPayload)
    return <AppLoading label={t("test.loading")} />;

  if (!payload) {
    return (
      <section className="border border-border bg-background p-6 space-y-4">
        <h2 className="text-xl font-serif text-foreground">
          {t("testSession.missingDataTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("testSession.missingDataDescription")}
        </p>
        <CustomButton
          type="button"
          styleType="menu"
          onClick={() => navigate("/perfil/test")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("testSession.backToConfig")}
        </CustomButton>
      </section>
    );
  }

  if (questions.length === 0) {
    return (
      <section className="border border-border bg-background p-6 space-y-4">
        <h2 className="text-xl font-serif text-foreground">
          {t("testSession.emptyQuestionsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("testSession.emptyQuestionsDescription")}
        </p>
        <CustomButton
          type="button"
          styleType="menu"
          onClick={() => navigate("/perfil/test")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("testSession.backToConfig")}
        </CustomButton>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {t("testSession.questionsLabel", { count: questions.length })}
          </p>
          {isHydratingAttempt && (
            <AppLoading
              variant="inline"
              label={t("test.loading")}
              className="ml-auto"
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("testSession.navigateHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {questions.map((question, questionIdx) => {
            const status = getQuestionStatus(question);
            const isActive = activeQuestionId === question.id;

            return (
              <button
                key={`nav-${question.id}`}
                type="button"
                onClick={() => goToQuestion(question.id)}
                className={cn(
                  "h-9 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors",
                  status === "correct" &&
                    "border-emerald-500 bg-emerald-500/15",
                  status === "wrong" && "border-destructive bg-destructive/15",
                  status === "answered" && "border-primary bg-primary/15",
                  status === "unanswered" && "border-border bg-background",
                  isActive &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                {questionIdx + 1}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border border-border bg-background p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {t("testSession.scoreLabel", {
              score: displayScore,
              total: displayScoreScaleMax
            })}
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("testSession.answeredLabel", {
            answered: answeredCount,
            total: questions.length
          })}
        </p>
        {attemptStartedAt && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {new Date(attemptStartedAt).toLocaleString()}
          </p>
        )}
        {isReadOnlyHistoryView && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("testSession.readOnlyHistoryDescription")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {questions.map((question, questionIdx) => {
          const userAnswer = selectedAnswers[question.id];
          const hasAnswer = typeof userAnswer === "number";
          const questionStatus = getQuestionStatus(question);

          return (
            <article
              key={question.id}
              id={`quick-test-question-${questionIdx + 1}`}
              className={cn(
                "border bg-background p-5 space-y-3 scroll-mt-24",
                questionStatus === "wrong" &&
                  "border-destructive/70 bg-destructive/5",
                questionStatus === "correct" &&
                  "border-emerald-500/60 bg-emerald-500/5",
                (questionStatus === "unanswered" ||
                  questionStatus === "answered") &&
                  "border-border"
              )}
            >
              <h2 className="text-sm font-semibold text-foreground">
                {t("testSession.questionLabel", { index: questionIdx + 1 })}
              </h2>
              <p className="text-sm leading-relaxed text-foreground">
                {question.statement}
              </p>

              <div className="space-y-2">
                {question.options.map((option, optionIdx) => {
                  const isSelected = userAnswer === optionIdx;
                  const isCorrectOption =
                    hasAnswer &&
                    question.correctIndex !== null &&
                    question.correctIndex === optionIdx;
                  const isSelectedWrong =
                    isSelected &&
                    question.correctIndex !== null &&
                    question.correctIndex !== optionIdx;
                  const isSelectedWithoutKey =
                    isSelected && question.correctIndex === null;

                  return (
                    <button
                      key={`${question.id}-${optionIdx}`}
                      type="button"
                      onClick={() => {
                        if (isReadOnlyHistoryView) return;
                        if (typeof selectedAnswers[question.id] === "number")
                          return;
                        setSelectedAnswers((prev) => ({
                          ...prev,
                          [question.id]: optionIdx
                        }));
                        setActiveQuestionId(question.id);
                      }}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors border-border bg-background text-foreground hover:bg-primary/10",
                        isSelectedWithoutKey &&
                          "border-primary bg-primary/15 text-foreground",
                        isCorrectOption &&
                          "border-emerald-600 bg-emerald-500/20",
                        isSelectedWrong &&
                          "border-destructive bg-destructive/10"
                      )}
                    >
                      <span className="font-semibold mr-2">
                        {String.fromCharCode(65 + optionIdx)}.
                      </span>
                      {option}
                    </button>
                  );
                })}
              </div>

              {hasAnswer && question.correctIndex !== null && (
                <p className="text-xs text-muted-foreground">
                  {t("testSession.correctAnswerLabel", {
                    option: String.fromCharCode(65 + question.correctIndex)
                  })}
                </p>
              )}
              {hasAnswer && question.correctIndex === null && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CircleHelp className="h-3.5 w-3.5" />
                  {t("testSession.noCorrectionKeyLabel")}
                </p>
              )}
              {hasAnswer && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    questionStatus === "correct" &&
                      "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
                    questionStatus === "wrong" &&
                      "border-destructive/50 bg-destructive/10 text-destructive",
                    (questionStatus === "answered" ||
                      questionStatus === "unanswered") &&
                      "border-primary/40 bg-primary/10 text-foreground"
                  )}
                >
                  {question.explanation.length > 0 ? (
                    <p>
                      {t("testSession.explanationLabel", {
                        explanation: question.explanation
                      })}
                    </p>
                  ) : (
                    <p>{t("testSession.noExplanationLabel")}</p>
                  )}
                  {question.sources.length > 0 && (
                    <p className="mt-1 opacity-90">
                      {t("testSession.sourcesLabel", {
                        sources: question.sources.join(" | ")
                      })}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="border border-border bg-background p-5 flex flex-wrap items-center gap-2">
        <CustomButton
          type="button"
          styleType="menu"
          onClick={() => navigate("/perfil/test")}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("testSession.backToConfig")}
        </CustomButton>
        {!isReadOnlyHistoryView && (
          <CustomButton
            type="button"
            styleType="menu"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RotateCcw className="h-4 w-4" />
            {t("testSession.retry")}
          </CustomButton>
        )}
        {isAllAnswered && !attemptFinishedAt && !isReadOnlyHistoryView && (
          <CustomButton
            type="button"
            styleType="primary"
            onClick={() => {
              void handleFinalizeTest();
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t("testSession.finalize")}
          </CustomButton>
        )}
      </section>

      <ConfirmActionDialog
        open={isLeaveDialogOpen}
        onOpenChange={handleLeaveDialogOpenChange}
        title={t("testSession.leaveDialogTitle")}
        description={t("testSession.leaveDialogDescription")}
        confirmLabel={t("testSession.leaveDialogConfirm")}
        cancelLabel={t("testSession.leaveDialogCancel")}
        onConfirm={async () => {
          blockedTransition?.retry();
          setBlockedTransition(null);
          setIsLeaveDialogOpen(false);
        }}
      />
      <Dialog
        open={isResultDialogOpen}
        onOpenChange={handleResultDialogOpenChange}
      >
        <DialogContent className="max-w-lg rounded-2xl border border-border/70 bg-background/95 p-8">
          <DialogHeader className="space-y-3 text-center">
            <DialogTitle className="text-2xl">
              {t("testSession.resultDialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t("testSession.resultDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 flex flex-col items-center gap-3">
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("testSession.yourTestLabel", {
                  count: evaluatedAttempt.totalQuestions,
                  defaultValue: "Tu test ({{count}} preguntas)"
                })}
              </p>
              <p className="mt-1 text-5xl font-bold tracking-tight text-foreground">
                {displayScore}
                <span className="text-2xl font-normal text-muted-foreground">
                  {" "}
                  / {displayScoreScaleMax}
                </span>
              </p>
            </div>
            {displayExtrapolatedScore !== null && officialQuestionCount && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("testSession.officialExtrapolationLabel", {
                    count: officialQuestionCount,
                    defaultValue:
                      "Proyección examen oficial ({{count}} preguntas)"
                  })}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground/80">
                  {displayExtrapolatedScore}
                  <span className="text-lg font-normal text-muted-foreground">
                    {" "}
                    / {displayScoreScaleMax}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                {t("testSession.correctCountLabel")}
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                {correctAnswers}
              </p>
            </div>
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                {t("testSession.wrongCountLabel")}
              </p>
              <p className="mt-1 text-2xl font-semibold text-destructive">
                {wrongAnswers}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                {t("testSession.blankCountLabel", {
                  defaultValue: "En blanco"
                })}
              </p>
              <p className="mt-1 text-2xl font-semibold text-muted-foreground">
                {blankAnswers}
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <CustomButton
              type="button"
              styleType="primary"
              onClick={() => handleResultDialogOpenChange(false)}
            >
              {t("testSession.goToDashboard")}
            </CustomButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfileQuickTestSession;
