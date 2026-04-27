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
import { registerActiveQuickTestPauseHandler } from "@/lib/quickTestPauseBridge";
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
  fetchQuickTestQuestionReportStates,
  fetchQuickTestSessionById,
  isUuid,
  reportQuickTestQuestion,
  resetQuickTestAttempt,
  saveQuickTestAttemptProgress,
  saveQuickTestAttemptProgressOnPageExit,
  type OppositionTestExamConfig,
  type QuickTestQuestionReportState,
  type QuickTestSessionPayload
} from "@/queries/testQueries";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  RotateCcw
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

type QuickTestLocationState = {
  quickTest?: QuickTestSessionPayload;
};

type NormalizedQuestion = {
  bankQuestionId: number | null;
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

const normalizeBankQuestionId = (
  raw: unknown,
  fallbackId?: string
): number | null => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = Math.floor(raw);
    return parsed > 0 ? parsed : null;
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  if (!fallbackId) return null;
  const match = fallbackId.match(/bank-question-(\d+)/i);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
    bankQuestionId: normalizeBankQuestionId(
      raw.bankQuestionId ?? raw.bank_question_id,
      id
    ),
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

type LeaveDestination = string;

const formatCountdown = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const computeQuickTestDurationSeconds = (
  questionCount: number,
  config: OppositionTestExamConfig | null
) => {
  const officialQuestionCount = config?.questionCount ?? null;
  const officialDurationMinutes = config?.durationMinutes ?? null;
  if (
    !officialQuestionCount ||
    !officialDurationMinutes ||
    officialQuestionCount <= 0 ||
    officialDurationMinutes <= 0 ||
    questionCount <= 0
  )
    return null;

  return Math.max(
    60,
    Math.round(
      (officialDurationMinutes * 60 * questionCount) / officialQuestionCount
    )
  );
};

const ProfileQuickTestSession = () => {
  const { t } = useTranslation(["profile", "plans"]);
  const { user, session, isAuthReady } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const hasQuickTestsAccess = isPaidPlan(planState);
  const { testId: routeTestId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const ensuredAttemptForTestRef = useRef<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const lastAutoPauseSignatureRef = useRef<string | null>(null);
  const isFinalizingRef = useRef(false);
  const skipLeaveAutoPauseRef = useRef(false);
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
  const [pausedRemainingSeconds, setPausedRemainingSeconds] = useState<
    number | null
  >(null);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isInternalNavigation, setIsInternalNavigation] = useState(false);
  const [pendingNavigationTo, setPendingNavigationTo] = useState<string | null>(
    null
  );
  const [timerNowMs, setTimerNowMs] = useState(() => Date.now());
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
  const [questionReportStates, setQuestionReportStates] = useState<
    Record<number, QuickTestQuestionReportState>
  >({});
  const [isLoadingQuestionReportStates, setIsLoadingQuestionReportStates] =
    useState(false);
  const [reportTargetQuestionId, setReportTargetQuestionId] = useState<
    string | null
  >(null);
  const [isReportingQuestion, setIsReportingQuestion] = useState(false);

  useEffect(() => {
    setPayload(initialPayload);
    setIsLoadingPayload(!initialPayload);
    setSelectedAnswers({});
    setActiveQuestionId(null);
    setAttemptStartedAt(null);
    setAttemptFinishedAt(null);
    setPausedRemainingSeconds(null);
    setIsResultDialogOpen(false);
    setIsFinalizeDialogOpen(false);
    setIsPausing(false);
    setIsInternalNavigation(false);
    setIsHydratingAttempt(false);
    setIsAttemptHydrated(false);
    setIsFinishing(false);
    setPendingNavigationTo(null);
    setTimerNowMs(Date.now());
    setQuestionReportStates({});
    setIsLoadingQuestionReportStates(false);
    setReportTargetQuestionId(null);
    setIsReportingQuestion(false);
    skipLeaveAutoPauseRef.current = false;
    isFinalizingRef.current = false;
    ensuredAttemptForTestRef.current = null;
    lastSavedSignatureRef.current = null;
    lastAutoPauseSignatureRef.current = null;
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
      } catch (error) {
        console.error("[quick-test] load payload failed", error);
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
      .catch((error) => {
        console.error("[quick-test] load test exam config failed", error);
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
  const bankQuestionIds = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .map((question) => question.bankQuestionId)
            .filter(
              (bankQuestionId): bankQuestionId is number =>
                typeof bankQuestionId === "number" &&
                Number.isFinite(bankQuestionId)
            )
        )
      ),
    [questions]
  );
  const reportTargetQuestion = useMemo(
    () =>
      reportTargetQuestionId
        ? (questionById.get(reportTargetQuestionId) ?? null)
        : null,
    [questionById, reportTargetQuestionId]
  );

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.id || bankQuestionIds.length === 0) {
      setQuestionReportStates({});
      setIsLoadingQuestionReportStates(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingQuestionReportStates(true);

    const loadQuestionReportStates = async () => {
      try {
        const reportStates = await runSingleFlight(
          `quick-test:question-report-state:${user.id}:${bankQuestionIds.join(",")}`,
          () => fetchQuickTestQuestionReportStates(bankQuestionIds),
          { reuseResultForMs: 800 }
        );
        if (isCancelled) return;

        setQuestionReportStates(
          Object.fromEntries(
            Array.from(reportStates.values()).map((state) => [
              state.questionId,
              state
            ])
          )
        );
      } catch {
        if (!isCancelled) setQuestionReportStates({});
      } finally {
        if (!isCancelled) setIsLoadingQuestionReportStates(false);
      }
    };

    void loadQuestionReportStates();

    return () => {
      isCancelled = true;
    };
  }, [bankQuestionIds, isAuthReady, user?.id]);

  const getQuestionReportState = useCallback(
    (question: NormalizedQuestion) =>
      question.bankQuestionId !== null
        ? (questionReportStates[question.bankQuestionId] ?? null)
        : null,
    [questionReportStates]
  );
  const disabledBankQuestionIds = useMemo(
    () =>
      Object.values(questionReportStates)
        .filter((state) => state.isDisabled)
        .map((state) => state.questionId),
    [questionReportStates]
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
        const savedProgress = getQuickTestProgress(routeTestId);
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
        const resolvedPausedRemainingSeconds = attempt?.finishedAt
          ? null
          : (attempt?.pausedRemainingSeconds ??
            savedProgress?.pausedRemainingSeconds ??
            null);
        const localAnswers = sanitizeSelectedAnswers(
          savedProgress?.selectedAnswers,
          questionById
        );
        setAttemptStartedAt(attempt?.startedAt ?? null);
        setAttemptFinishedAt(attempt?.finishedAt ?? null);
        setPausedRemainingSeconds(resolvedPausedRemainingSeconds);

        const dbAnswers = sanitizeSelectedAnswers(
          attempt?.selectedAnswers,
          questionById
        );
        const localUpdatedAtMs = savedProgress?.updatedAt
          ? new Date(savedProgress.updatedAt).valueOf()
          : Number.NaN;
        const remoteUpdatedAtMs = attempt?.updatedAt
          ? new Date(attempt.updatedAt).valueOf()
          : Number.NaN;
        const shouldUseLocalSnapshot =
          Number.isFinite(localUpdatedAtMs) &&
          (!Number.isFinite(remoteUpdatedAtMs) ||
            localUpdatedAtMs >= remoteUpdatedAtMs);
        const restoredAnswers = shouldUseLocalSnapshot
          ? localAnswers
          : dbAnswers;
        const restoredActiveQuestionId =
          shouldUseLocalSnapshot &&
          savedProgress?.activeQuestionId &&
          questionById.has(savedProgress.activeQuestionId)
            ? savedProgress.activeQuestionId
            : attempt?.activeQuestionId &&
                questionById.has(attempt.activeQuestionId as string)
              ? attempt.activeQuestionId
              : (questions[0]?.id ?? null);

        setSelectedAnswers(restoredAnswers);
        setActiveQuestionId(restoredActiveQuestionId);
        lastSavedSignatureRef.current = shouldUseLocalSnapshot
          ? null
          : JSON.stringify({
              selectedAnswers: restoredAnswers,
              activeQuestionId: restoredActiveQuestionId ?? null,
              finishedAt: attempt?.finishedAt ?? null,
              startedAt: attempt?.startedAt ?? null,
              pausedRemainingSeconds: resolvedPausedRemainingSeconds
            });
        setQuickTestProgress(routeTestId, {
          selectedAnswers: restoredAnswers,
          activeQuestionId: restoredActiveQuestionId,
          updatedAt:
            shouldUseLocalSnapshot && savedProgress?.updatedAt
              ? savedProgress.updatedAt
              : (attempt?.updatedAt ?? new Date().toISOString()),
          pausedRemainingSeconds: resolvedPausedRemainingSeconds,
          pauseRequestedAt: attempt?.finishedAt
            ? null
            : (savedProgress?.pauseRequestedAt ?? null)
        });
      } catch (error) {
        console.error("[quick-test] hydrate attempt failed", error);
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

  useEffect(() => {
    if (!hasQuickTestsAccess) return;
    const intervalId = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [hasQuickTestsAccess]);

  const evaluatedAttempt = useMemo(
    () =>
      evaluateQuickTestAttempt(questions, selectedAnswers, testExamConfig, {
        disabledBankQuestionIds
      }),
    [disabledBankQuestionIds, questions, selectedAnswers, testExamConfig]
  );
  const answeredCount = evaluatedAttempt.answeredCount;
  const activeQuestionCount = evaluatedAttempt.totalQuestions;
  const disabledQuestionCount = Math.max(
    0,
    questions.length - activeQuestionCount
  );
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

  const totalDurationSeconds = useMemo(
    () => computeQuickTestDurationSeconds(questions.length, testExamConfig),
    [questions.length, testExamConfig]
  );
  const attemptStartedAtMs = useMemo(() => {
    if (!attemptStartedAt) return null;
    const parsed = new Date(attemptStartedAt).valueOf();
    return Number.isFinite(parsed) ? parsed : null;
  }, [attemptStartedAt]);
  const remainingSeconds = useMemo(() => {
    if (!totalDurationSeconds || !attemptStartedAtMs) return null;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((timerNowMs - attemptStartedAtMs) / 1000)
    );
    return Math.max(0, totalDurationSeconds - elapsedSeconds);
  }, [attemptStartedAtMs, timerNowMs, totalDurationSeconds]);
  const isTimedAttempt = totalDurationSeconds !== null;
  const isTimeUp =
    hasQuickTestsAccess &&
    isTimedAttempt &&
    remainingSeconds !== null &&
    remainingSeconds <= 0;

  const isReadOnlyHistoryView =
    !hasQuickTestsAccess && Boolean(attemptFinishedAt);
  const shouldConfirmLeave =
    hasQuickTestsAccess &&
    isAttemptHydrated &&
    activeQuestionCount > 0 &&
    !attemptFinishedAt &&
    !isInternalNavigation &&
    !isReadOnlyHistoryView &&
    !isTimeUp;

  useEffect(() => {
    if (!shouldConfirmLeave) return;

    const currentTarget = location.pathname + location.search + location.hash;
    const handleDocumentLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const rawTarget = event.target;
      if (!(rawTarget instanceof Element)) return;

      const anchor = rawTarget.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const nextTarget = `${url.pathname}${url.search}${url.hash}`;
      if (nextTarget === currentTarget) return;

      event.preventDefault();
      setPendingNavigationTo(nextTarget);
      setIsLeaveDialogOpen(true);
    };

    document.addEventListener("click", handleDocumentLinkClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentLinkClick, true);
    };
  }, [location.hash, location.pathname, location.search, shouldConfirmLeave]);

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
      finishedAt: attemptFinishedAt ?? null,
      startedAt: attemptStartedAt ?? null,
      pausedRemainingSeconds
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
            startedAt: attemptStartedAt ?? undefined,
            finishedAt: attemptFinishedAt ?? undefined,
            pausedRemainingSeconds
          }),
        { reuseResultForMs: 400 }
      )
        .then(() => {
          lastSavedSignatureRef.current = signature;
        })
        .catch((error) => {
          console.error("[quick-test] save attempt failed", error);
        });
    }, 180);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [
    activeQuestionId,
    attemptStartedAt,
    attemptFinishedAt,
    isAttemptHydrated,
    pausedRemainingSeconds,
    questionById,
    hasQuickTestsAccess,
    questions,
    routeTestId,
    selectedAnswers,
    user?.id
  ]);

  const getQuestionStatus = (question: NormalizedQuestion) => {
    const questionReportState = getQuestionReportState(question);
    if (questionReportState?.isDisabled) return "disabled";
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
    questions.length > 0 &&
    (activeQuestionCount === 0 || answeredCount === activeQuestionCount);
  const wrongAnswers = evaluatedAttempt.wrongCount;
  const correctAnswers = evaluatedAttempt.correctCount;
  const blankAnswers = evaluatedAttempt.blankCount;

  const officialQuestionCount = testExamConfig?.questionCount ?? null;
  const timerDurationMinutes = useMemo(() => {
    const officialDurationMinutes = testExamConfig?.durationMinutes ?? null;
    if (!officialDurationMinutes || officialDurationMinutes <= 0) return null;

    const currentQuestionCount =
      payload?.questionCount && payload.questionCount > 0
        ? payload.questionCount
        : questions.length;
    if (currentQuestionCount <= 0) return null;

    if (!officialQuestionCount || officialQuestionCount <= 0)
      return officialDurationMinutes;

    return Math.max(
      1,
      Math.ceil(
        (officialDurationMinutes * currentQuestionCount) / officialQuestionCount
      )
    );
  }, [
    officialQuestionCount,
    payload?.questionCount,
    questions.length,
    testExamConfig?.durationMinutes
  ]);
  const timerEndsAtMs = useMemo(() => {
    if (!attemptStartedAt || !timerDurationMinutes) return null;
    const startedAtMs = new Date(attemptStartedAt).getTime();
    if (!Number.isFinite(startedAtMs)) return null;
    return startedAtMs + timerDurationMinutes * 60 * 1000;
  }, [attemptStartedAt, timerDurationMinutes]);
  const shouldShowFloatingTimer =
    hasQuickTestsAccess &&
    questions.length > 0 &&
    !attemptFinishedAt &&
    !isReadOnlyHistoryView &&
    timerEndsAtMs !== null;
  const remainingTimerSeconds = useMemo(() => {
    if (timerEndsAtMs === null) return null;
    return Math.max(0, Math.ceil((timerEndsAtMs - timerNowMs) / 1000));
  }, [timerEndsAtMs, timerNowMs]);
  const formattedRemainingTimer = useMemo(() => {
    if (remainingTimerSeconds === null) return null;
    return formatCountdown(remainingTimerSeconds);
  }, [remainingTimerSeconds]);
  const isTimerCritical =
    remainingTimerSeconds !== null && remainingTimerSeconds < 60;
  const persistPauseSnapshotLocally = useCallback(
    (pausedSeconds: number | null) => {
      if (!routeTestId || questions.length === 0) return;

      const updatedAtIso = new Date().toISOString();
      const normalizedSelectedAnswers = sanitizeSelectedAnswers(
        selectedAnswers,
        questionById
      );

      setQuickTestProgress(routeTestId, {
        selectedAnswers: normalizedSelectedAnswers,
        activeQuestionId,
        updatedAt: updatedAtIso,
        pausedRemainingSeconds: pausedSeconds,
        pauseRequestedAt: pausedSeconds === null ? null : updatedAtIso
      });
    },
    [
      activeQuestionId,
      questionById,
      questions.length,
      routeTestId,
      selectedAnswers
    ]
  );

  const persistPauseOnPageExit = useCallback(() => {
    if (!shouldConfirmLeave) return;
    if (skipLeaveAutoPauseRef.current) return;

    const pausedSeconds = remainingTimerSeconds ?? null;
    const normalizedSelectedAnswers = sanitizeSelectedAnswers(
      selectedAnswers,
      questionById
    );
    const signature = JSON.stringify({
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId: activeQuestionId ?? null,
      pausedRemainingSeconds: pausedSeconds,
      startedAt: attemptStartedAt ?? null
    });

    if (lastAutoPauseSignatureRef.current === signature) return;
    lastAutoPauseSignatureRef.current = signature;

    persistPauseSnapshotLocally(pausedSeconds);

    if (!user?.id || !routeTestId || !isUuid(routeTestId)) return;

    saveQuickTestAttemptProgressOnPageExit({
      testId: routeTestId,
      userId: user.id,
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId,
      startedAt: attemptStartedAt ?? undefined,
      pausedRemainingSeconds: pausedSeconds,
      accessToken: session?.access_token ?? null
    });
  }, [
    activeQuestionId,
    attemptStartedAt,
    persistPauseSnapshotLocally,
    questionById,
    remainingTimerSeconds,
    routeTestId,
    selectedAnswers,
    session?.access_token,
    shouldConfirmLeave,
    user?.id
  ]);

  const pauseCurrentAttemptSilently = useCallback(async () => {
    if (!shouldConfirmLeave) return false;
    if (isPausing) return true;

    const updatedAtIso = new Date().toISOString();
    const pausedSeconds = remainingTimerSeconds ?? null;
    const normalizedSelectedAnswers = sanitizeSelectedAnswers(
      selectedAnswers,
      questionById
    );
    const signature = JSON.stringify({
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId: activeQuestionId ?? null,
      finishedAt: null,
      startedAt: attemptStartedAt ?? null
    });

    persistPauseSnapshotLocally(pausedSeconds);
    setPausedRemainingSeconds(pausedSeconds);

    if (user?.id && routeTestId && isUuid(routeTestId)) {
      try {
        await saveQuickTestAttemptProgress({
          testId: routeTestId,
          userId: user.id,
          selectedAnswers: normalizedSelectedAnswers,
          activeQuestionId,
          startedAt: attemptStartedAt ?? undefined,
          pausedRemainingSeconds: pausedSeconds
        });
        lastSavedSignatureRef.current = signature;
      } catch (error) {
        console.error("[quick-test] silent pause attempt failed", error);
        return false;
      }
    } else if (routeTestId) {
      setQuickTestProgress(routeTestId, {
        selectedAnswers: normalizedSelectedAnswers,
        activeQuestionId,
        updatedAt: updatedAtIso,
        pausedRemainingSeconds: pausedSeconds,
        pauseRequestedAt: pausedSeconds === null ? null : updatedAtIso
      });
    }

    return true;
  }, [
    activeQuestionId,
    attemptStartedAt,
    isPausing,
    persistPauseSnapshotLocally,
    questionById,
    remainingTimerSeconds,
    routeTestId,
    selectedAnswers,
    shouldConfirmLeave,
    user?.id
  ]);

  useEffect(() => {
    if (!shouldConfirmLeave) return;
    return registerActiveQuickTestPauseHandler(pauseCurrentAttemptSilently);
  }, [pauseCurrentAttemptSilently, shouldConfirmLeave]);

  useEffect(() => {
    if (!shouldConfirmLeave) return;

    const handlePageHide = () => {
      persistPauseOnPageExit();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      persistPauseOnPageExit();
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [persistPauseOnPageExit, shouldConfirmLeave]);

  useEffect(() => {
    if (!isAttemptHydrated) return;
    if (pausedRemainingSeconds === null) return;
    if (attemptFinishedAt) {
      setPausedRemainingSeconds(null);
      return;
    }
    if (!timerDurationMinutes || timerDurationMinutes <= 0) return;

    const durationSeconds = Math.max(1, Math.ceil(timerDurationMinutes * 60));
    const safeRemainingSeconds = Math.max(
      0,
      Math.min(durationSeconds, pausedRemainingSeconds)
    );
    const resumedStartedAtIso = new Date(
      Date.now() - Math.max(0, durationSeconds - safeRemainingSeconds) * 1000
    ).toISOString();
    const normalizedSelectedAnswers = sanitizeSelectedAnswers(
      selectedAnswers,
      questionById
    );

    setAttemptStartedAt(resumedStartedAtIso);
    setPausedRemainingSeconds(null);
    persistPauseSnapshotLocally(null);

    if (!user?.id || !routeTestId || !isUuid(routeTestId)) return;

    void saveQuickTestAttemptProgress({
      testId: routeTestId,
      userId: user.id,
      selectedAnswers: normalizedSelectedAnswers,
      activeQuestionId,
      startedAt: resumedStartedAtIso,
      pausedRemainingSeconds: null
    }).catch(() => {});
  }, [
    activeQuestionId,
    attemptFinishedAt,
    isAttemptHydrated,
    pausedRemainingSeconds,
    persistPauseSnapshotLocally,
    questionById,
    routeTestId,
    selectedAnswers,
    timerDurationMinutes,
    user?.id
  ]);

  useEffect(() => {
    if (!shouldShowFloatingTimer) return;
    setTimerNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldShowFloatingTimer]);

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

  const pauseAndLeaveTest = useCallback(
    async (destination: LeaveDestination = "/dashboard") => {
      if (isPausing) return;

      if (attemptFinishedAt || isReadOnlyHistoryView) {
        skipLeaveAutoPauseRef.current = true;
        setIsInternalNavigation(true);
        navigate(destination);
        return;
      }

      setIsPausing(true);
      setIsInternalNavigation(true);

      const pauseSucceeded = await pauseCurrentAttemptSilently();

      if (pauseSucceeded && user?.id) {
        await queryClient.invalidateQueries({
          queryKey: ["quick-tests", "dashboard-bundle", user.id]
        });
      }

      setIsLeaveDialogOpen(false);
      setPendingNavigationTo(null);
      skipLeaveAutoPauseRef.current = true;

      navigate(destination);

      setIsPausing(false);
    },
    [
      attemptFinishedAt,
      isPausing,
      isReadOnlyHistoryView,
      navigate,
      pauseCurrentAttemptSilently,
      setPendingNavigationTo,
      queryClient,
      user?.id
    ]
  );

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
          updatedAt: nowIso,
          pausedRemainingSeconds: null,
          pauseRequestedAt: null
        });
      }

      setSelectedAnswers({});
      setActiveQuestionId(firstQuestionId);
      setAttemptStartedAt(nowIso);
      setAttemptFinishedAt(null);
      setPausedRemainingSeconds(null);
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
        setPausedRemainingSeconds(resetAttempt?.pausedRemainingSeconds ?? null);
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
    } catch (error) {
      console.error("[quick-test] clone retry failed", error);
      await resetInPlace();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLeaveDialogOpenChange = (open: boolean) => {
    setIsLeaveDialogOpen(open);
    if (!open) setPendingNavigationTo(null);
  };
  const handleReportDialogOpenChange = (open: boolean) => {
    if (!open && !isReportingQuestion) setReportTargetQuestionId(null);
  };
  const handleFinalizeDialogOpenChange = (open: boolean) => {
    if (!isFinishing) setIsFinalizeDialogOpen(open);
  };

  const handleConfirmQuestionReport = async () => {
    const targetQuestion = reportTargetQuestion;
    if (!targetQuestion?.bankQuestionId) {
      setReportTargetQuestionId(null);
      return;
    }

    setIsReportingQuestion(true);

    try {
      const nextState = await reportQuickTestQuestion({
        questionId: targetQuestion.bankQuestionId,
        testId: routeTestId
      });
      setQuestionReportStates((prev) => ({
        ...prev,
        [nextState.questionId]: nextState
      }));
      setReportTargetQuestionId(null);
    } catch {
      return;
    } finally {
      setIsReportingQuestion(false);
    }
  };

  const handleFinalizeTest = useCallback(
    async ({
      force = false,
      redirectToDashboard = false
    }: {
      force?: boolean;
      redirectToDashboard?: boolean;
    } = {}) => {
      if (isReadOnlyHistoryView || attemptFinishedAt || isFinalizingRef.current)
        return;
      if (!force && !isAllAnswered) return;

      const finishedAtIso = new Date().toISOString();
      const normalizedSelectedAnswers = sanitizeSelectedAnswers(
        selectedAnswers,
        questionById
      );
      const signature = JSON.stringify({
        selectedAnswers: normalizedSelectedAnswers,
        activeQuestionId: activeQuestionId ?? null,
        finishedAt: finishedAtIso,
        startedAt: attemptStartedAt ?? null
      });

      isFinalizingRef.current = true;
      setIsFinishing(true);

      try {
        if (routeTestId) {
          setQuickTestProgress(routeTestId, {
            selectedAnswers: normalizedSelectedAnswers,
            activeQuestionId,
            updatedAt: finishedAtIso,
            pausedRemainingSeconds: null,
            pauseRequestedAt: null
          });
        }

        if (user?.id && routeTestId && isUuid(routeTestId)) {
          await saveQuickTestAttemptProgress({
            testId: routeTestId,
            userId: user.id,
            selectedAnswers: normalizedSelectedAnswers,
            activeQuestionId,
            startedAt: attemptStartedAt ?? undefined,
            finishedAt: finishedAtIso,
            pausedRemainingSeconds: null
          });
          lastSavedSignatureRef.current = signature;
          await queryClient.invalidateQueries({
            queryKey: ["quick-tests", "dashboard-bundle", user.id]
          });
        }

        setAttemptFinishedAt(finishedAtIso);
        skipLeaveAutoPauseRef.current = true;
        if (redirectToDashboard) {
          setIsInternalNavigation(true);
          navigate("/dashboard");
          return;
        }
        setIsResultDialogOpen(true);
      } catch {
        return;
      } finally {
        isFinalizingRef.current = false;
        setIsFinishing(false);
      }
    },
    [
      activeQuestionId,
      attemptStartedAt,
      attemptFinishedAt,
      isAllAnswered,
      isReadOnlyHistoryView,
      navigate,
      questionById,
      queryClient,
      routeTestId,
      selectedAnswers,
      user?.id
    ]
  );

  useEffect(() => {
    if (!hasQuickTestsAccess) return;
    if (!isAttemptHydrated) return;
    if (questions.length === 0) return;
    if (!isTimeUp) return;
    if (attemptFinishedAt) return;

    void handleFinalizeTest({ force: true, redirectToDashboard: true });
  }, [
    attemptFinishedAt,
    handleFinalizeTest,
    hasQuickTestsAccess,
    isAttemptHydrated,
    isTimeUp,
    questions.length
  ]);

  const handleResultDialogOpenChange = (open: boolean) => {
    setIsResultDialogOpen(open);
    if (!open) {
      skipLeaveAutoPauseRef.current = true;
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
        <p className="mb-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
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
      <section className="space-y-4 border border-border bg-background p-6">
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
      <section className="space-y-4 border border-border bg-background p-6">
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
      {shouldShowFloatingTimer && formattedRemainingTimer ? (
        <div
          className={cn(
            "fixed top-[7.5rem] right-4 z-[65] rounded-2xl border px-4 py-3 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:right-5",
            isTimerCritical
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-primary/20 bg-background/90 text-foreground"
          )}
        >
          <p
            className={cn(
              "text-[11px] font-semibold tracking-[0.24em] uppercase",
              isTimerCritical ? "text-destructive/90" : "text-muted-foreground"
            )}
          >
            {t("testSession.remainingLabel")}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formattedRemainingTimer}
          </p>
        </div>
      ) : null}

      <section className="border border-border bg-background p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {t("testSession.questionsLabel", { count: activeQuestionCount })}
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
        {disabledQuestionCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("testSession.disabledQuestionsLabel", {
              count: disabledQuestionCount
            })}
          </p>
        )}
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
                  status === "disabled" &&
                    "border-border/70 bg-muted/40 text-muted-foreground",
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
            total: activeQuestionCount
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
          const questionReportState = getQuestionReportState(question);
          const isQuestionDisabled = Boolean(questionReportState?.isDisabled);
          const hasUserReportedQuestion = Boolean(
            questionReportState?.userReported
          );
          const canReportQuestion =
            !isReadOnlyHistoryView &&
            !isQuestionDisabled &&
            !hasUserReportedQuestion &&
            !isLoadingQuestionReportStates &&
            question.bankQuestionId !== null;

          return (
            <article
              key={question.id}
              id={`quick-test-question-${questionIdx + 1}`}
              className={cn(
                "scroll-mt-24 space-y-3 border bg-background p-5",
                questionStatus === "wrong" &&
                  "border-destructive/70 bg-destructive/5",
                questionStatus === "correct" &&
                  "border-emerald-500/60 bg-emerald-500/5",
                questionStatus === "disabled" && "border-border/70 bg-muted/25",
                (questionStatus === "unanswered" ||
                  questionStatus === "answered") &&
                  "border-border"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("testSession.questionLabel", { index: questionIdx + 1 })}
                </h2>
                <button
                  type="button"
                  onClick={() => setReportTargetQuestionId(question.id)}
                  disabled={!canReportQuestion || isReportingQuestion}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    isQuestionDisabled
                      ? "border-border bg-muted/40 text-muted-foreground"
                      : hasUserReportedQuestion
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
                  )}
                  aria-label={t("testSession.reportAction")}
                  title={t("testSession.reportAction")}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{t("testSession.reportAction")}</span>
                </button>
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {question.statement}
              </p>
              {isQuestionDisabled && (
                <p className="text-xs text-muted-foreground">
                  {t("testSession.disabledQuestionDescription")}
                </p>
              )}
              {!isQuestionDisabled && hasUserReportedQuestion && (
                <p className="text-xs text-muted-foreground">
                  {t("testSession.reportedQuestionDescription")}
                </p>
              )}

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
                      disabled={
                        isQuestionDisabled ||
                        isReadOnlyHistoryView ||
                        Boolean(attemptFinishedAt) ||
                        isTimeUp ||
                        typeof selectedAnswers[question.id] === "number"
                      }
                      onClick={() => {
                        if (isReadOnlyHistoryView) return;
                        if (isQuestionDisabled) return;
                        if (typeof selectedAnswers[question.id] === "number")
                          return;
                        setSelectedAnswers((prev) => ({
                          ...prev,
                          [question.id]: optionIdx
                        }));
                        setActiveQuestionId(question.id);
                      }}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors border-border bg-background text-foreground hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-65",
                        isSelectedWithoutKey &&
                          "border-primary bg-primary/15 text-foreground",
                        isCorrectOption &&
                          "border-emerald-600 bg-emerald-500/20",
                        isSelectedWrong &&
                          "border-destructive bg-destructive/10",
                        isQuestionDisabled &&
                          "border-border/70 bg-muted/35 text-muted-foreground"
                      )}
                    >
                      <span className="mr-2 font-semibold">
                        {String.fromCharCode(65 + optionIdx)}.
                      </span>
                      {option}
                    </button>
                  );
                })}
              </div>

              {hasAnswer &&
                !isQuestionDisabled &&
                question.correctIndex !== null && (
                  <p className="text-xs text-muted-foreground">
                    {t("testSession.correctAnswerLabel", {
                      option: String.fromCharCode(65 + question.correctIndex)
                    })}
                  </p>
                )}
              {hasAnswer &&
                !isQuestionDisabled &&
                question.correctIndex === null && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CircleHelp className="h-3.5 w-3.5" />
                    {t("testSession.noCorrectionKeyLabel")}
                  </p>
                )}
              {hasAnswer && !isQuestionDisabled && (
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

      <section className="flex flex-wrap items-center gap-2 border border-border bg-background p-5">
        <CustomButton
          type="button"
          styleType="menu"
          disabled={isPausing}
          onClick={() => {
            if (attemptFinishedAt) {
              skipLeaveAutoPauseRef.current = true;
              if (window.history.length > 1) navigate(-1);
              else navigate("/dashboard");
              return;
            }
            setPendingNavigationTo(null);
            setIsLeaveDialogOpen(true);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          {!attemptFinishedAt ? t("testSession.pause") : t("testSession.back")}
        </CustomButton>
        {!isReadOnlyHistoryView &&
          (!attemptFinishedAt ? (
            <CustomButton
              type="button"
              styleType="primary"
              disabled={isFinishing || isPausing}
              onClick={() => setIsFinalizeDialogOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("testSession.finalize")}
            </CustomButton>
          ) : (
            <CustomButton
              type="button"
              styleType="menu"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              <RotateCcw className="h-4 w-4" />
              {t("testSession.retry")}
            </CustomButton>
          ))}
      </section>

      <ConfirmActionDialog
        open={isLeaveDialogOpen}
        onOpenChange={handleLeaveDialogOpenChange}
        title={t("testSession.leaveDialogTitle")}
        description={t("testSession.leaveDialogDescription")}
        confirmLabel={t("testSession.leaveDialogConfirm")}
        cancelLabel={t("testSession.leaveDialogCancel")}
        onConfirm={async () => {
          await pauseAndLeaveTest(pendingNavigationTo ?? "/dashboard");
        }}
      />
      <ConfirmActionDialog
        open={isFinalizeDialogOpen}
        onOpenChange={handleFinalizeDialogOpenChange}
        title={t("testSession.finalizeDialogTitle")}
        description={t("testSession.finalizeDialogDescription")}
        confirmLabel={t("testSession.finalizeDialogConfirm")}
        cancelLabel={t("testSession.finalizeDialogCancel")}
        isLoading={isFinishing}
        onConfirm={async () => {
          await handleFinalizeTest({ force: true });
          setIsFinalizeDialogOpen(false);
        }}
      />
      <ConfirmActionDialog
        open={Boolean(reportTargetQuestion)}
        onOpenChange={handleReportDialogOpenChange}
        title={t("testSession.reportDialogTitle")}
        description={t("testSession.reportDialogDescription")}
        confirmLabel={t("testSession.reportDialogConfirm")}
        cancelLabel={t("testSession.reportDialogCancel")}
        isLoading={isReportingQuestion}
        onConfirm={handleConfirmQuestionReport}
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
