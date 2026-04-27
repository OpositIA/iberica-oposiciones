import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { getStoredInProgressQuickTests } from "@/lib/quickTestStorage";

export type QuickTestTopicSelection = {
  id: string;
  label: string;
  scope?: "topic" | "block";
};

export type GenerateQuickTestPayload = {
  mode?: "mock" | "quick";
  oppositionId: string;
  oppositionName: string;
  questionCount: number;
  locale: string;
  selectedTopics: QuickTestTopicSelection[];
};

export type GenerateQuickTestResponse = {
  testId?: string;
  questionCount?: number;
  selectedTopics?: QuickTestTopicSelection[];
  questions?: unknown[];
  used?: number;
  limit?: number;
};

export type OppositionTestExamConfig = {
  exerciseLabel: string;
  systemScope: string | null;
  questionCount: number | null;
  optionsCount: number | null;
  correctAnswerValue: number | null;
  wrongAnswerPenalty: number | null;
  blankAnswerPenalty: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  passingScore: number | null;
  durationMinutes: number | null;
  notes: string | null;
  sourceExcerpt: string | null;
  isPrimary: boolean;
};

export type QuickTestSessionPayload = {
  testId: string;
  oppositionId: string | null;
  oppositionName: string;
  questionCount: number;
  selectedTopics: QuickTestTopicSelection[];
  questions: unknown[];
};

export type FetchReusableQuickTestSessionParams = {
  userId: string;
  oppositionId: string | null | undefined;
  questionCount: number;
  selectedTopics: QuickTestTopicSelection[];
};

export type QuickTestAttemptPayload = {
  selectedAnswers: Record<string, number>;
  activeQuestionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  pausedRemainingSeconds: number | null;
};

export type QuickTestHistoryRecord = {
  testId: string;
  oppositionName: string;
  finishedAt: string;
  startedAt: string;
  score: number;
  accuracy: number;
  durationMinutes: number;
  questionCount: number;
  status: "excellent" | "approved" | "reinforce";
};

export type QuickTestHistoryPage = {
  items: QuickTestHistoryRecord[];
  total: number;
  nextOffset: number | null;
};

export type QuickTestDashboardStats = {
  completedTests: number;
  averageScore: number;
  averageAccuracy: number;
};

export type QuickTestsDashboardBundle = {
  stats: QuickTestDashboardStats;
  inProgress: InProgressQuickTestSummary | null;
  historyItems: QuickTestHistoryRecord[];
};

export type InProgressQuickTestSummary = {
  testId: string;
  answeredCount: number;
  questionCount: number | null;
  pausedRemainingSeconds: number | null;
  startedAt: string;
  lastInteractionAt: string;
  oppositionName: string;
  selectedTopics: QuickTestTopicSelection[];
};

export type QuickTestQuestionReportState = {
  questionId: number;
  reportCount: number;
  userReported: boolean;
  isDisabled: boolean;
  reportThreshold: number;
};

const QUESTION_LIMIT_MIN = 1;
const QUESTION_LIMIT_MAX = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | null | undefined) =>
  typeof value === "string" && UUID_REGEX.test(value.trim());

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

const normalizeQuestionCount = (raw: unknown): number => {
  const numeric =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.floor(raw)
      : QUESTION_LIMIT_MIN;
  return Math.min(QUESTION_LIMIT_MAX, Math.max(QUESTION_LIMIT_MIN, numeric));
};

const normalizeTopics = (raw: unknown): QuickTestTopicSelection[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((topic): QuickTestTopicSelection | null => {
      if (!topic || typeof topic !== "object") return null;
      const maybeTopic = topic as Record<string, unknown>;
      const id = sanitizeCode(maybeTopic.id, 120);
      const label = sanitizeSingleLineText(maybeTopic.label, 220);
      if (!id || !label) return null;
      const scope =
        maybeTopic.scope === "block" || maybeTopic.scope === "topic"
          ? maybeTopic.scope
          : undefined;
      return { id, label, scope };
    })
    .filter((topic): topic is QuickTestTopicSelection => Boolean(topic));
};

const buildTopicsSignature = (topics: QuickTestTopicSelection[]) =>
  topics
    .map(
      (topic) =>
        `${(topic.scope ?? "topic").toLowerCase()}::${topic.id.toLowerCase()}::${topic.label.toLowerCase()}`
    )
    .sort((a, b) => a.localeCompare(b))
    .join("||");

const hasMatchingTopics = (
  leftRaw: unknown,
  rightTopics: QuickTestTopicSelection[]
) => {
  const leftTopics = normalizeTopics(leftRaw);
  if (leftTopics.length === 0 || rightTopics.length === 0) return false;
  return buildTopicsSignature(leftTopics) === buildTopicsSignature(rightTopics);
};

const normalizeQuestions = (raw: unknown): unknown[] =>
  Array.isArray(raw) ? raw : [];

const normalizeSelectedAnswers = (raw: unknown): Record<string, number> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const maybeRecord = raw as Record<string, unknown>;
  const normalized: Record<string, number> = {};

  Object.entries(maybeRecord).forEach(([questionId, rawAnswer]) => {
    if (typeof rawAnswer !== "number" || !Number.isFinite(rawAnswer)) return;
    normalized[questionId] = Math.floor(rawAnswer);
  });

  return normalized;
};

const normalizeNullableNumber = (raw: unknown): number | null => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number(raw.trim().replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeNullablePositiveInt = (raw: unknown): number | null => {
  const parsed = normalizeNullableNumber(raw);
  if (parsed === null) return null;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
};

const normalizeNullableNonNegativeInt = (raw: unknown): number | null => {
  const parsed = normalizeNullableNumber(raw);
  if (parsed === null) return null;
  const integer = Math.floor(parsed);
  return integer >= 0 ? integer : null;
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

const normalizeOptionEntry = (
  input: unknown,
  fallbackId: string
): { text: string; id: string } | null => {
  if (typeof input === "string" && input.trim().length > 0)
    return { text: input.trim(), id: fallbackId };

  if (!isRecord(input)) return null;

  const text = pickString(input, [
    "text",
    "label",
    "content",
    "option",
    "answer"
  ]);
  if (!text) return null;
  const id =
    pickString(input, ["id", "optionId", "value", "key"]) ?? fallbackId;
  return { text, id };
};

const normalizeQuestionOptions = (
  input: unknown
): { options: string[]; optionIds: string[] } => {
  if (Array.isArray(input)) {
    const entries = input
      .map((option, idx) =>
        normalizeOptionEntry(option, String.fromCharCode(65 + idx))
      )
      .filter((entry): entry is { text: string; id: string } => Boolean(entry));

    return {
      options: entries.map((entry) => entry.text),
      optionIds: entries.map((entry) => entry.id)
    };
  }

  if (!isRecord(input)) return { options: [], optionIds: [] };

  const letterKeys = Object.keys(input).filter((key) => /^[A-D]$/i.test(key));
  if (letterKeys.length > 0) {
    const ordered = letterKeys.sort((a, b) => a.localeCompare(b));
    const entries = ordered
      .map((key) => normalizeOptionEntry(input[key], key))
      .filter((entry): entry is { text: string; id: string } => Boolean(entry));
    return {
      options: entries.map((entry) => entry.text),
      optionIds: entries.map((entry) => entry.id)
    };
  }

  const values = Object.values(input);
  const entries = values
    .map((value, idx) =>
      normalizeOptionEntry(value, String.fromCharCode(65 + idx))
    )
    .filter((entry): entry is { text: string; id: string } => Boolean(entry));

  return {
    options: entries.map((entry) => entry.text),
    optionIds: entries.map((entry) => entry.id)
  };
};

const normalizeCorrectIndex = (
  input: unknown,
  options: string[],
  optionIds: string[]
): number | null => {
  const optionCount = options.length;

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

type EvaluatedQuestion = {
  bankQuestionId: number | null;
  disabled: boolean;
  id: string;
  correctIndex: number | null;
};

const normalizeBankQuestionId = (
  raw: unknown,
  fallbackId?: string
): number | null => {
  const parsedFromRaw = normalizeNullablePositiveInt(raw);
  if (parsedFromRaw !== null) return parsedFromRaw;
  if (!fallbackId) return null;
  const match = fallbackId.match(/bank-question-(\d+)/i);
  if (!match?.[1]) return null;
  return normalizeNullablePositiveInt(match[1]);
};

const normalizeQuestionsForEvaluation = (
  raw: unknown,
  options?: {
    disabledBankQuestionIds?: Iterable<number>;
  }
): EvaluatedQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const disabledBankQuestionIds = new Set(
    options?.disabledBankQuestionIds ?? []
  );

  return raw
    .map((item, idx): EvaluatedQuestion | null => {
      if (!isRecord(item)) return null;

      const { options, optionIds } = normalizeQuestionOptions(
        item.options ?? item.choices ?? item.answers ?? item.alternatives
      );
      if (options.length === 0) return null;

      const id =
        pickString(item, ["id", "questionId", "uid"]) ?? `question-${idx + 1}`;
      const correctRaw =
        item.correctIndex ??
        item.correctOptionIndex ??
        item.correct_index ??
        item.correctAnswerIndex ??
        item.answerIndex ??
        item.correctOptionId ??
        item.correct_option_id ??
        item.correct ??
        item.correctOption ??
        item.correct_answer ??
        item.correctAnswer;

      return {
        bankQuestionId: normalizeBankQuestionId(
          item.bankQuestionId ?? item.bank_question_id,
          id
        ),
        disabled:
          item.disabled === true ||
          disabledBankQuestionIds.has(
            normalizeBankQuestionId(
              item.bankQuestionId ?? item.bank_question_id,
              id
            ) ?? -1
          ),
        id,
        correctIndex: normalizeCorrectIndex(correctRaw, options, optionIds)
      };
    })
    .filter((question): question is EvaluatedQuestion => Boolean(question));
};

const loadCurrentOppositionTestExamConfigMap = async (
  oppositionIds: Array<string | null | undefined>
): Promise<Map<string, OppositionTestExamConfig>> => {
  const normalizedIds = Array.from(
    new Set(
      oppositionIds
        .map((value) => sanitizeCode(value, 160))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (normalizedIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("opposition_test_exam_configs" as never)
    .select(
      "opposition_id, exercise_label, system_scope, question_count, options_count, correct_answer_value, wrong_answer_penalty, blank_answer_penalty, score_min, score_max, passing_score, duration_minutes, notes, source_excerpt, opposition_syllabi!inner(is_current)"
    )
    .in("opposition_id", normalizedIds)
    .eq("opposition_syllabi.is_current" as never, true)
    .overrideTypes<Record<string, unknown>[], { merge: false }>();

  if (error) throw error;

  const configMap = new Map<string, OppositionTestExamConfig>();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const oppositionId = sanitizeCode(row.opposition_id, 160);
    if (!oppositionId) return;

    const config: OppositionTestExamConfig = {
      exerciseLabel: sanitizeSingleLineText(row.exercise_label, 240) || "",
      systemScope: sanitizeSingleLineText(row.system_scope, 160) || null,
      questionCount: normalizeNullablePositiveInt(row.question_count),
      optionsCount: normalizeNullablePositiveInt(row.options_count),
      correctAnswerValue: normalizeNullableNumber(row.correct_answer_value),
      wrongAnswerPenalty: normalizeNullableNumber(row.wrong_answer_penalty),
      blankAnswerPenalty: normalizeNullableNumber(row.blank_answer_penalty),
      scoreMin: normalizeNullableNumber(row.score_min),
      scoreMax: normalizeNullableNumber(row.score_max),
      passingScore: normalizeNullableNumber(row.passing_score),
      durationMinutes: normalizeNullablePositiveInt(row.duration_minutes),
      notes: sanitizeSingleLineText(row.notes, 1500) || null,
      sourceExcerpt: sanitizeSingleLineText(row.source_excerpt, 2000) || null,
      isPrimary: true
    };

    if (config.exerciseLabel) configMap.set(oppositionId, config);
  });

  return configMap;
};

export const fetchCurrentOppositionPrimaryTestExamConfig = async (
  oppositionId: string | null | undefined
): Promise<OppositionTestExamConfig | null> => {
  const configMap = await loadCurrentOppositionTestExamConfigMap([
    oppositionId
  ]);
  const normalizedId = sanitizeCode(oppositionId, 160);
  return normalizedId ? (configMap.get(normalizedId) ?? null) : null;
};

export const evaluateQuickTestAttempt = (
  questionsRaw: unknown,
  selectedAnswersRaw: unknown,
  testConfig?: OppositionTestExamConfig | null,
  options?: {
    disabledBankQuestionIds?: Iterable<number>;
  }
): {
  answeredCount: number;
  totalQuestions: number;
  score: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  scoreScaleMax: number;
} => {
  const questions = normalizeQuestionsForEvaluation(questionsRaw, options);
  const activeQuestions = questions.filter((question) => !question.disabled);
  const selectedAnswers = normalizeSelectedAnswers(selectedAnswersRaw);
  const questionIdSet = new Set(activeQuestions.map((question) => question.id));
  const answeredCount = Object.keys(selectedAnswers).filter((questionId) =>
    questionIdSet.has(questionId)
  ).length;

  const gradeable = activeQuestions.filter(
    (question) => question.correctIndex !== null
  );
  const denominator =
    gradeable.length > 0 ? gradeable.length : activeQuestions.length;
  if (denominator === 0) {
    return {
      answeredCount,
      totalQuestions: 0,
      score: 0,
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      blankCount: 0,
      scoreScaleMax: normalizeNullableNumber(testConfig?.scoreMax) ?? 10
    };
  }

  const correctCount = gradeable.reduce((acc, question) => {
    const selected = selectedAnswers[question.id];
    return selected === question.correctIndex ? acc + 1 : acc;
  }, 0);
  const wrongCount = gradeable.reduce((acc, question) => {
    const selected = selectedAnswers[question.id];
    if (typeof selected !== "number") return acc;
    return selected === question.correctIndex ? acc : acc + 1;
  }, 0);
  const accuracy = (correctCount / denominator) * 100;
  const correctAnswerValue =
    normalizeNullableNumber(testConfig?.correctAnswerValue) ?? 1;
  const wrongAnswerPenalty =
    normalizeNullableNumber(testConfig?.wrongAnswerPenalty) ?? 0;
  const blankAnswerPenalty =
    normalizeNullableNumber(testConfig?.blankAnswerPenalty) ?? 0;
  const scoreMin = normalizeNullableNumber(testConfig?.scoreMin) ?? 0;
  const scoreMax = normalizeNullableNumber(testConfig?.scoreMax) ?? 10;

  const blankCount = Math.max(0, denominator - correctCount - wrongCount);
  const maxRawScore = denominator * correctAnswerValue;
  const rawScore =
    correctCount * correctAnswerValue -
    wrongCount * wrongAnswerPenalty -
    blankCount * blankAnswerPenalty;
  const normalizedScore =
    maxRawScore > 0 ? Math.max(0, Math.min(1, rawScore / maxRawScore)) : 0;
  const score = scoreMin + normalizedScore * Math.max(0, scoreMax - scoreMin);

  return {
    answeredCount,
    totalQuestions: activeQuestions.length,
    score,
    accuracy,
    correctCount,
    wrongCount,
    blankCount,
    scoreScaleMax: scoreMax
  };
};

const normalizeQuickTestQuestionReportState = (
  row: {
    is_disabled: boolean;
    question_id: number;
    report_count: number;
    report_threshold: number;
    user_reported: boolean;
  } | null
): QuickTestQuestionReportState | null => {
  if (!row) return null;

  const questionId = normalizeNullablePositiveInt(row.question_id);
  const reportCount = normalizeNullableNonNegativeInt(row.report_count);
  const reportThreshold = normalizeNullablePositiveInt(row.report_threshold);

  if (questionId === null || reportCount === null || reportThreshold === null)
    return null;

  return {
    questionId,
    reportCount,
    userReported: Boolean(row.user_reported),
    isDisabled: Boolean(row.is_disabled),
    reportThreshold
  };
};

export const fetchQuickTestQuestionReportStates = async (
  questionIds: number[]
): Promise<Map<number, QuickTestQuestionReportState>> => {
  const normalizedQuestionIds = Array.from(
    new Set(
      questionIds
        .map((questionId) => normalizeNullablePositiveInt(questionId))
        .filter((questionId): questionId is number => questionId !== null)
    )
  );

  if (normalizedQuestionIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc(
    "get_question_bank_question_report_state",
    {
      p_question_ids: normalizedQuestionIds
    }
  );

  if (error) throw error;

  const stateMap = new Map<number, QuickTestQuestionReportState>();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const normalized = normalizeQuickTestQuestionReportState(row);
    if (!normalized) return;
    stateMap.set(normalized.questionId, normalized);
  });

  return stateMap;
};

type ReportQuickTestQuestionParams = {
  questionId: number;
  testId?: string | null;
};

export const reportQuickTestQuestion = async ({
  questionId,
  testId
}: ReportQuickTestQuestionParams): Promise<QuickTestQuestionReportState> => {
  const normalizedQuestionId = normalizeNullablePositiveInt(questionId);
  if (normalizedQuestionId === null)
    throw new Error("No se pudo identificar la pregunta.");

  const { data, error } = await supabase.rpc("report_question_bank_question", {
    p_question_id: normalizedQuestionId,
    p_quick_test_id: isUuid(testId) ? testId : null
  });

  if (error) throw error;

  const normalized = normalizeQuickTestQuestionReportState(
    Array.isArray(data) ? (data[0] ?? null) : null
  );

  if (!normalized)
    throw new Error("No se pudo registrar el reporte de la pregunta.");

  return normalized;
};

const mapQuickTestRowToPayload = (
  row: {
    id: string;
    opposition_id: string | null;
    opposition_name: string;
    question_count: number;
    selected_topics: unknown;
    questions: unknown;
  } | null
): QuickTestSessionPayload | null => {
  if (!row) return null;

  return {
    testId: row.id,
    oppositionId: sanitizeCode(row.opposition_id, 160) || null,
    oppositionName: row.opposition_name,
    questionCount: normalizeQuestionCount(row.question_count),
    selectedTopics: normalizeTopics(row.selected_topics),
    questions: normalizeQuestions(row.questions)
  };
};

const mapQuickTestAttemptRow = (
  row: {
    selected_answers: unknown;
    active_question_id: string | null;
    started_at: string;
    finished_at: string | null;
    updated_at: string;
    paused_remaining_seconds?: unknown;
  } | null
): QuickTestAttemptPayload | null => {
  if (!row) return null;

  return {
    selectedAnswers: normalizeSelectedAnswers(row.selected_answers),
    activeQuestionId: row.active_question_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
    pausedRemainingSeconds: normalizeNullableNonNegativeInt(
      row.paused_remaining_seconds
    )
  };
};

export const generateQuickTest = async (
  payload: GenerateQuickTestPayload
): Promise<GenerateQuickTestResponse> => {
  const sanitizedPayload: GenerateQuickTestPayload = {
    mode: payload.mode === "mock" ? "mock" : "quick",
    oppositionId: sanitizeCode(payload.oppositionId, 120),
    oppositionName: sanitizeSingleLineText(payload.oppositionName, 160),
    questionCount: normalizeQuestionCount(payload.questionCount),
    locale: sanitizeCode(payload.locale, 12) || "es",
    selectedTopics: normalizeTopics(payload.selectedTopics)
  };

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para generar un test rapido.");

  const { data, error } =
    await supabase.functions.invoke<GenerateQuickTestResponse>(
      "generate-quick-test",
      {
        body: sanitizedPayload,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

  if (error) {
    let message = error.message || "No se pudo generar el test rapido.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        // keep original message
      }
    }

    throw new Error(message);
  }
  if (!data || typeof data !== "object")
    throw new Error("Invalid response from generate-quick-test.");

  return data;
};

type UpsertQuickTestSessionParams = {
  userId: string;
  oppositionId: string | null | undefined;
  payload: QuickTestSessionPayload;
};

export const upsertQuickTestSession = async ({
  userId,
  oppositionId,
  payload
}: UpsertQuickTestSessionParams): Promise<QuickTestSessionPayload> => {
  const normalizedOppositionId =
    typeof oppositionId === "string" && oppositionId.trim().length > 0
      ? oppositionId.trim()
      : null;

  const { data, error } = await supabase
    .from("quick_tests")
    .upsert(
      {
        id: sanitizeCode(payload.testId, 80),
        user_id: userId,
        opposition_id: normalizedOppositionId,
        opposition_name: sanitizeSingleLineText(payload.oppositionName, 160),
        question_count: normalizeQuestionCount(payload.questionCount),
        selected_topics: normalizeTopics(payload.selectedTopics) as Json,
        questions: normalizeQuestions(payload.questions) as Json
      },
      {
        onConflict: "id"
      }
    )
    .select(
      "id, opposition_id, opposition_name, question_count, selected_topics, questions"
    )
    .maybeSingle();

  if (error) throw error;

  const normalized = mapQuickTestRowToPayload(data);
  if (!normalized) throw new Error("No se pudo guardar el test rapido.");
  return normalized;
};

export const fetchQuickTestSessionById = async (
  testId: string,
  userId: string
): Promise<QuickTestSessionPayload | null> => {
  if (!isUuid(testId)) return null;

  const { data, error } = await supabase
    .from("quick_tests")
    .select(
      "id, opposition_id, opposition_name, question_count, selected_topics, questions"
    )
    .eq("id", testId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return mapQuickTestRowToPayload(data);
};

export const fetchReusableQuickTestSession = async ({
  userId,
  oppositionId,
  questionCount,
  selectedTopics
}: FetchReusableQuickTestSessionParams): Promise<QuickTestSessionPayload | null> => {
  const normalizedOppositionId =
    typeof oppositionId === "string" && oppositionId.trim().length > 0
      ? oppositionId.trim()
      : null;
  const normalizedTopics = normalizeTopics(selectedTopics);
  if (normalizedTopics.length === 0) return null;

  let query = supabase
    .from("quick_tests")
    .select(
      "id, opposition_id, opposition_name, question_count, selected_topics, questions, created_at"
    )
    .eq("user_id", userId)
    .eq("question_count", normalizeQuestionCount(questionCount))
    .order("created_at", { ascending: true })
    .limit(200);

  if (normalizedOppositionId)
    query = query.eq("opposition_id", normalizedOppositionId);

  const { data, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;

  const matchedRows = data.filter((row) =>
    hasMatchingTopics(row.selected_topics, normalizedTopics)
  );
  if (matchedRows.length === 0) return null;

  const candidateIds = matchedRows
    .map((row) => row.id)
    .filter((testId): testId is string => isUuid(testId));
  if (candidateIds.length === 0) return null;

  const { data: attempts, error: attemptsError } = await supabase
    .from("quick_test_attempts")
    .select("test_id")
    .eq("user_id", userId)
    .in("test_id", candidateIds);
  if (attemptsError) throw attemptsError;

  const attemptedTestIds = new Set(
    (Array.isArray(attempts) ? attempts : [])
      .map((attempt) => attempt.test_id)
      .filter((testId): testId is string => typeof testId === "string")
  );

  const reusableRow =
    matchedRows.find((row) => !attemptedTestIds.has(row.id)) ?? null;

  return reusableRow ? mapQuickTestRowToPayload(reusableRow) : null;
};

type CloneQuickTestSessionParams = {
  sourceTestId: string;
  userId: string;
};

export const cloneQuickTestSession = async ({
  sourceTestId,
  userId
}: CloneQuickTestSessionParams): Promise<QuickTestSessionPayload | null> => {
  if (!isUuid(sourceTestId)) return null;

  const quickTestsTable = supabase.from("quick_tests") as unknown as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{
          data: {
            id: string;
            opposition_id: string | null;
            opposition_name: string;
            question_count: number;
            selected_topics: unknown;
            questions: unknown;
          } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data: sourceRow, error: sourceError } = await quickTestsTable
    .select("*")
    .eq("id", sourceTestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceRow) return null;

  const nowIso = new Date().toISOString();
  const newTestId = buildClientUuid();
  const clonedRow: Record<string, unknown> = {
    ...sourceRow,
    id: newTestId,
    user_id: userId,
    created_at: nowIso,
    updated_at: nowIso
  };

  const { data, error } = await quickTestsTable
    .insert(clonedRow)
    .select(
      "id, opposition_id, opposition_name, question_count, selected_topics, questions"
    )
    .maybeSingle();
  if (error) throw error;

  return mapQuickTestRowToPayload(data);
};

export const fetchQuickTestAttempt = async (
  testId: string,
  userId: string
): Promise<QuickTestAttemptPayload | null> => {
  if (!isUuid(testId)) return null;

  const { data, error } = await supabase
    .from("quick_test_attempts")
    .select(
      "selected_answers, active_question_id, started_at, finished_at, updated_at, paused_remaining_seconds"
    )
    .eq("test_id", testId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return mapQuickTestAttemptRow(data);
};

export const fetchLatestInProgressQuickTest = async (
  userId: string
): Promise<InProgressQuickTestSummary | null> => {
  const { data, error } = await supabase
    .from("quick_test_attempts")
    .select(
      "test_id, selected_answers, started_at, last_interaction_at, finished_at, paused_remaining_seconds, quick_tests!inner(opposition_name, selected_topics, question_count)"
    )
    .eq("user_id", userId)
    .is("finished_at", null)
    .order("last_interaction_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;

  const withAnswers = data
    .map((row) => {
      const normalizedAnswers = normalizeSelectedAnswers(row.selected_answers);
      const linkedQuickTest = Array.isArray(row.quick_tests)
        ? (row.quick_tests[0] ?? null)
        : (row.quick_tests ?? null);
      return {
        testId: row.test_id,
        answeredCount: Object.keys(normalizedAnswers).length,
        questionCount: normalizeNullablePositiveInt(
          linkedQuickTest?.question_count
        ),
        pausedRemainingSeconds: normalizeNullableNonNegativeInt(
          row.paused_remaining_seconds
        ),
        startedAt: row.started_at,
        lastInteractionAt: row.last_interaction_at,
        oppositionName:
          sanitizeSingleLineText(linkedQuickTest?.opposition_name, 160) ||
          "Test rapido",
        selectedTopics: normalizeTopics(linkedQuickTest?.selected_topics)
      };
    })
    .filter((attempt) => isUuid(attempt.testId));

  const localCandidate = getStoredInProgressQuickTests()[0] ?? null;
  const remoteCandidate = withAnswers[0] ?? null;
  if (!localCandidate) return remoteCandidate;
  if (!remoteCandidate) return localCandidate;

  return new Date(localCandidate.lastInteractionAt).valueOf() >=
    new Date(remoteCandidate.lastInteractionAt).valueOf()
    ? localCandidate
    : remoteCandidate;
};

export const discardInProgressQuickTests = async (
  userId: string
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("quick_test_attempts")
    .select("test_id")
    .eq("user_id", userId)
    .is("finished_at", null);

  if (error) throw error;

  const activeTestIds = Array.isArray(data)
    ? data
        .map((row) => row.test_id)
        .filter((testId): testId is string => isUuid(testId))
    : [];

  if (activeTestIds.length === 0) return [];

  const { error: deleteError } = await supabase
    .from("quick_tests")
    .delete()
    .eq("user_id", userId)
    .in("id", activeTestIds);

  if (deleteError) throw deleteError;

  return activeTestIds;
};

type FetchQuickTestHistoryPageParams = {
  userId: string;
  offset: number;
  limit: number;
};

const resolveLinkedQuickTest = (
  raw:
    | {
        opposition_id: string | null;
        opposition_name: string | null;
        selected_topics?: unknown;
        question_count?: unknown;
        questions: unknown;
      }
    | {
        opposition_id: string | null;
        opposition_name: string | null;
        selected_topics?: unknown;
        question_count?: unknown;
        questions: unknown;
      }[]
    | null
) => {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
};

const resolveHistoryStatus = (
  accuracy: number
): "excellent" | "approved" | "reinforce" => {
  if (accuracy >= 85) return "excellent";
  if (accuracy >= 70) return "approved";
  return "reinforce";
};

type QuickTestAttemptJoinedRow = {
  test_id: string;
  selected_answers: unknown;
  started_at: string;
  finished_at: string | null;
  last_interaction_at: string;
  paused_remaining_seconds?: unknown;
  quick_tests:
    | {
        opposition_id: string | null;
        opposition_name: string | null;
        selected_topics?: unknown;
        question_count?: unknown;
        questions: unknown;
      }
    | {
        opposition_id: string | null;
        opposition_name: string | null;
        selected_topics?: unknown;
        question_count?: unknown;
        questions: unknown;
      }[]
    | null;
};

const mapCompletedAttemptToHistoryRecord = (
  row: QuickTestAttemptJoinedRow,
  configByOppositionId: Map<string, OppositionTestExamConfig>
): QuickTestHistoryRecord | null => {
  const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests);
  if (!linkedQuickTest) return null;
  if (!row.finished_at) return null;

  const finishedAt = row.finished_at ?? row.started_at;
  const startedAt = row.started_at ?? finishedAt;
  const startMs = new Date(startedAt).valueOf();
  const finishMs = new Date(finishedAt).valueOf();
  const durationMinutes =
    Number.isFinite(startMs) && Number.isFinite(finishMs)
      ? Math.max(1, Math.round(Math.max(0, finishMs - startMs) / 60000))
      : 1;

  const oppositionId = sanitizeCode(linkedQuickTest.opposition_id, 160);
  const evaluated = evaluateQuickTestAttempt(
    linkedQuickTest.questions,
    row.selected_answers,
    oppositionId ? (configByOppositionId.get(oppositionId) ?? null) : null
  );

  return {
    testId: row.test_id,
    oppositionName: linkedQuickTest.opposition_name?.trim() || "Test rapido",
    finishedAt,
    startedAt,
    score: evaluated.score,
    accuracy: evaluated.accuracy,
    durationMinutes,
    questionCount: evaluated.totalQuestions,
    status: resolveHistoryStatus(evaluated.accuracy)
  };
};

const DASHBOARD_BUNDLE_MAX_ROWS = 2000;

export const fetchQuickTestsDashboardBundle = async (
  userId: string
): Promise<QuickTestsDashboardBundle> => {
  const { data, error } = await supabase
    .from("quick_test_attempts")
    .select(
      "test_id, selected_answers, started_at, finished_at, last_interaction_at, paused_remaining_seconds, quick_tests!inner(opposition_id, opposition_name, selected_topics, question_count, questions)"
    )
    .eq("user_id", userId)
    .order("last_interaction_at", { ascending: false })
    .limit(DASHBOARD_BUNDLE_MAX_ROWS)
    .overrideTypes<QuickTestAttemptJoinedRow[], { merge: false }>();

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const configByOppositionId = await loadCurrentOppositionTestExamConfigMap(
    rows.map((row) => {
      const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests);
      return linkedQuickTest?.opposition_id ?? null;
    })
  );

  const remoteInProgress =
    rows
      .filter((row) => !row.finished_at)
      .map((row) => {
        const normalizedAnswers = normalizeSelectedAnswers(
          row.selected_answers
        );
        const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests);
        return {
          testId: row.test_id,
          answeredCount: Object.keys(normalizedAnswers).length,
          questionCount: normalizeNullablePositiveInt(
            linkedQuickTest?.question_count
          ),
          pausedRemainingSeconds: normalizeNullableNonNegativeInt(
            row.paused_remaining_seconds
          ),
          startedAt: row.started_at,
          lastInteractionAt: row.last_interaction_at,
          oppositionName:
            sanitizeSingleLineText(linkedQuickTest?.opposition_name, 160) ||
            "Test rapido",
          selectedTopics: normalizeTopics(linkedQuickTest?.selected_topics)
        } satisfies InProgressQuickTestSummary;
      })
      .filter((attempt) => isUuid(attempt.testId))
      .sort(
        (a, b) =>
          new Date(b.lastInteractionAt).valueOf() -
          new Date(a.lastInteractionAt).valueOf()
      )[0] ?? null;

  const localInProgress = getStoredInProgressQuickTests()[0] ?? null;
  const inProgress =
    localInProgress &&
    (!remoteInProgress ||
      new Date(localInProgress.lastInteractionAt).valueOf() >=
        new Date(remoteInProgress.lastInteractionAt).valueOf())
      ? localInProgress
      : remoteInProgress;

  const historyItems = rows
    .filter((row) => Boolean(row.finished_at))
    .sort(
      (a, b) =>
        new Date(b.finished_at ?? b.started_at).valueOf() -
        new Date(a.finished_at ?? a.started_at).valueOf()
    )
    .map((row) => mapCompletedAttemptToHistoryRecord(row, configByOppositionId))
    .filter((item): item is QuickTestHistoryRecord => Boolean(item));

  const completedTests = historyItems.length;
  const stats: QuickTestDashboardStats =
    completedTests > 0
      ? {
          completedTests,
          averageScore: Number(
            (
              historyItems.reduce((acc, item) => acc + item.score, 0) /
              completedTests
            ).toFixed(1)
          ),
          averageAccuracy: Number(
            Math.round(
              historyItems.reduce((acc, item) => acc + item.accuracy, 0) /
                completedTests
            )
          )
        }
      : {
          completedTests: 0,
          averageScore: 0,
          averageAccuracy: 0
        };

  return {
    stats,
    inProgress,
    historyItems
  };
};

export const fetchQuickTestHistoryPage = async ({
  userId,
  offset,
  limit
}: FetchQuickTestHistoryPageParams): Promise<QuickTestHistoryPage> => {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  const { data, error, count } = await supabase
    .from("quick_test_attempts")
    .select(
      "test_id, selected_answers, started_at, finished_at, quick_tests!inner(opposition_id, opposition_name, questions)",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const configByOppositionId = await loadCurrentOppositionTestExamConfigMap(
    rows.map((row) => {
      const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests as never);
      return linkedQuickTest?.opposition_id ?? null;
    })
  );
  const items = rows
    .map((row) => {
      const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests as never);
      if (!linkedQuickTest) return null;

      const finishedAt = row.finished_at ?? row.started_at;
      const startedAt = row.started_at ?? finishedAt;
      const startMs = new Date(startedAt).valueOf();
      const finishMs = new Date(finishedAt).valueOf();
      const durationMinutes =
        Number.isFinite(startMs) && Number.isFinite(finishMs)
          ? Math.max(1, Math.round(Math.max(0, finishMs - startMs) / 60000))
          : 1;

      const oppositionId = sanitizeCode(linkedQuickTest.opposition_id, 160);
      const evaluated = evaluateQuickTestAttempt(
        linkedQuickTest.questions,
        row.selected_answers,
        oppositionId ? (configByOppositionId.get(oppositionId) ?? null) : null
      );

      return {
        testId: row.test_id,
        oppositionName:
          linkedQuickTest.opposition_name?.trim() || "Test rapido",
        finishedAt,
        startedAt,
        score: evaluated.score,
        accuracy: evaluated.accuracy,
        durationMinutes,
        questionCount: evaluated.totalQuestions,
        status: resolveHistoryStatus(evaluated.accuracy)
      } satisfies QuickTestHistoryRecord;
    })
    .filter((item): item is QuickTestHistoryRecord => Boolean(item));

  const total = typeof count === "number" ? count : items.length;
  const nextOffset =
    safeOffset + rows.length < total ? safeOffset + safeLimit : null;

  return {
    items,
    total,
    nextOffset
  };
};

const STATS_BATCH_SIZE = 200;
const STATS_MAX_ROWS = 2000;

export const fetchQuickTestDashboardStats = async (
  userId: string
): Promise<QuickTestDashboardStats> => {
  const { count, error: countError } = await supabase
    .from("quick_test_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("finished_at", "is", null);

  if (countError) throw countError;

  const completedTests = typeof count === "number" ? count : 0;
  if (completedTests === 0) {
    return {
      completedTests: 0,
      averageScore: 0,
      averageAccuracy: 0
    };
  }

  let offset = 0;
  let processedRows = 0;
  let scoreSum = 0;
  let accuracySum = 0;

  while (offset < STATS_MAX_ROWS) {
    const { data, error } = await supabase
      .from("quick_test_attempts")
      .select("selected_answers, quick_tests!inner(opposition_id, questions)")
      .eq("user_id", userId)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .range(offset, offset + STATS_BATCH_SIZE - 1);

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;

    const configByOppositionId = await loadCurrentOppositionTestExamConfigMap(
      data.map((row) => {
        const linkedQuickTest = resolveLinkedQuickTest(
          row.quick_tests as never
        );
        return linkedQuickTest?.opposition_id ?? null;
      })
    );

    data.forEach((row) => {
      const linkedQuickTest = resolveLinkedQuickTest(row.quick_tests as never);
      if (!linkedQuickTest) return;
      const oppositionId = sanitizeCode(linkedQuickTest.opposition_id, 160);
      const evaluated = evaluateQuickTestAttempt(
        linkedQuickTest.questions,
        row.selected_answers,
        oppositionId ? (configByOppositionId.get(oppositionId) ?? null) : null
      );
      scoreSum += evaluated.score;
      accuracySum += evaluated.accuracy;
      processedRows += 1;
    });

    if (data.length < STATS_BATCH_SIZE) break;
    offset += STATS_BATCH_SIZE;
  }

  if (processedRows === 0) {
    return {
      completedTests,
      averageScore: 0,
      averageAccuracy: 0
    };
  }

  return {
    completedTests,
    averageScore: Number((scoreSum / processedRows).toFixed(1)),
    averageAccuracy: Number(Math.round(accuracySum / processedRows))
  };
};

type EnsureQuickTestAttemptParams = {
  testId: string;
  userId: string;
  initialActiveQuestionId?: string | null;
};

export const ensureQuickTestAttempt = async ({
  testId,
  userId,
  initialActiveQuestionId = null
}: EnsureQuickTestAttemptParams): Promise<QuickTestAttemptPayload | null> => {
  const existingAttempt = await fetchQuickTestAttempt(testId, userId);
  if (existingAttempt) return existingAttempt;
  if (!isUuid(testId)) return null;

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("quick_test_attempts").upsert(
    {
      test_id: testId,
      user_id: userId,
      selected_answers: {},
      active_question_id: initialActiveQuestionId,
      started_at: nowIso,
      last_interaction_at: nowIso
    },
    {
      onConflict: "test_id,user_id",
      ignoreDuplicates: true
    }
  );

  if (error) throw error;
  return fetchQuickTestAttempt(testId, userId);
};

type SaveQuickTestAttemptProgressParams = {
  testId: string;
  userId: string;
  selectedAnswers: Record<string, number>;
  activeQuestionId: string | null;
  finishedAt?: string | null;
  startedAt?: string;
  pausedRemainingSeconds?: number | null;
};

type SaveQuickTestAttemptProgressOnPageExitParams =
  SaveQuickTestAttemptProgressParams & {
    accessToken?: string | null;
  };

export const saveQuickTestAttemptProgress = async ({
  testId,
  userId,
  selectedAnswers,
  activeQuestionId,
  finishedAt,
  startedAt,
  pausedRemainingSeconds
}: SaveQuickTestAttemptProgressParams): Promise<void> => {
  if (!isUuid(testId)) return;

  const nowIso = new Date().toISOString();
  const payload: {
    test_id: string;
    user_id: string;
    selected_answers: Record<string, number>;
    active_question_id: string | null;
    last_interaction_at: string;
    finished_at?: string | null;
    started_at?: string;
    paused_remaining_seconds?: number | null;
  } = {
    test_id: testId,
    user_id: userId,
    selected_answers: selectedAnswers,
    active_question_id: activeQuestionId,
    last_interaction_at: nowIso
  };

  if (typeof finishedAt !== "undefined") payload.finished_at = finishedAt;
  if (typeof startedAt !== "undefined") payload.started_at = startedAt;
  if (typeof pausedRemainingSeconds !== "undefined")
    payload.paused_remaining_seconds = pausedRemainingSeconds;

  const { error } = await supabase.from("quick_test_attempts").upsert(payload, {
    onConflict: "test_id,user_id"
  });

  if (error) throw error;
};

export const saveQuickTestAttemptProgressOnPageExit = ({
  testId,
  userId,
  selectedAnswers,
  activeQuestionId,
  finishedAt,
  startedAt,
  pausedRemainingSeconds,
  accessToken
}: SaveQuickTestAttemptProgressOnPageExitParams): boolean => {
  if (!isUuid(testId)) return false;

  const safeAccessToken = sanitizeSingleLineText(accessToken, 4096);
  const supabaseUrl = sanitizeSingleLineText(
    import.meta.env.VITE_SUPABASE_URL,
    512
  );
  const supabasePublishableKey = sanitizeSingleLineText(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    512
  );
  if (!safeAccessToken || !supabaseUrl || !supabasePublishableKey) return false;

  const nowIso = new Date().toISOString();
  const payload: {
    test_id: string;
    user_id: string;
    selected_answers: Record<string, number>;
    active_question_id: string | null;
    last_interaction_at: string;
    finished_at?: string | null;
    started_at?: string;
    paused_remaining_seconds?: number | null;
  } = {
    test_id: testId,
    user_id: userId,
    selected_answers: selectedAnswers,
    active_question_id: activeQuestionId,
    last_interaction_at: nowIso
  };

  if (typeof finishedAt !== "undefined") payload.finished_at = finishedAt;
  if (typeof startedAt !== "undefined") payload.started_at = startedAt;
  if (typeof pausedRemainingSeconds !== "undefined")
    payload.paused_remaining_seconds = pausedRemainingSeconds;

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/quick_test_attempts?on_conflict=test_id,user_id`;

  try {
    void fetch(endpoint, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${safeAccessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload)
    });
    return true;
  } catch {
    return false;
  }
};

type ResetQuickTestAttemptParams = {
  testId: string;
  userId: string;
  firstQuestionId: string | null;
};

export const resetQuickTestAttempt = async ({
  testId,
  userId,
  firstQuestionId
}: ResetQuickTestAttemptParams): Promise<QuickTestAttemptPayload | null> => {
  if (!isUuid(testId)) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("quick_test_attempts")
    .upsert(
      {
        test_id: testId,
        user_id: userId,
        selected_answers: {},
        active_question_id: firstQuestionId,
        started_at: nowIso,
        finished_at: null,
        last_interaction_at: nowIso,
        paused_remaining_seconds: null
      },
      {
        onConflict: "test_id,user_id"
      }
    )
    .select(
      "selected_answers, active_question_id, started_at, finished_at, updated_at, paused_remaining_seconds"
    )
    .maybeSingle();

  if (error) throw error;

  return mapQuickTestAttemptRow(data);
};
