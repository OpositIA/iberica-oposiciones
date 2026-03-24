import {
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText
} from "@/lib/inputSanitization";
import { type QuickTestSessionPayload } from "@/queries/testQueries";

const SESSION_PREFIX = "quick-test-session:";
const PROGRESS_PREFIX = "quick-test-progress:";

export type QuickTestProgress = {
  selectedAnswers: Record<string, number>;
  activeQuestionId: string | null;
  updatedAt: string;
};

const safeGetStorageItem = (
  storage: Storage | null,
  key: string
): string | null => {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorageItem = (
  storage: Storage | null,
  key: string,
  value: string
) => {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // no-op
  }
};

const safeRemoveStorageItem = (storage: Storage | null, key: string) => {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // no-op
  }
};

const safeParseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  if (raw.length > 500_000) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const getSessionKey = (testId: string) =>
  `${SESSION_PREFIX}${sanitizeCode(testId, 80) || "invalid"}`;
const getProgressKey = (testId: string) =>
  `${PROGRESS_PREFIX}${sanitizeCode(testId, 80) || "invalid"}`;

const getSessionStorage = () =>
  typeof window === "undefined" ? null : window.sessionStorage;
const getLocalStorage = () =>
  typeof window === "undefined" ? null : window.localStorage;

const normalizeQuickTestSessionPayload = (
  value: QuickTestSessionPayload | null
): QuickTestSessionPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const testId = sanitizeCode(value.testId, 80);
  const questionCount = sanitizeInteger(value.questionCount, {
    min: 1,
    max: 100
  });
  if (!testId || questionCount === null) return null;

  const selectedTopics = Array.isArray(value.selectedTopics)
    ? value.selectedTopics
        .map((topic) => ({
          id: sanitizeCode(topic?.id, 120),
          label: sanitizeSingleLineText(topic?.label, 160),
          scope:
            topic?.scope === "block" || topic?.scope === "topic"
              ? topic.scope
              : undefined
        }))
        .filter((topic) => topic.id && topic.label)
    : [];

  return {
    testId,
    oppositionId: sanitizeCode(value.oppositionId, 160) || null,
    oppositionName: sanitizeSingleLineText(value.oppositionName, 160),
    questionCount,
    selectedTopics,
    questions: Array.isArray(value.questions) ? value.questions : []
  };
};

const normalizeQuickTestProgress = (
  value: QuickTestProgress | null
): QuickTestProgress | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const selectedAnswersRaw = value.selectedAnswers;
  const selectedAnswers: Record<string, number> = {};
  if (
    selectedAnswersRaw &&
    typeof selectedAnswersRaw === "object" &&
    !Array.isArray(selectedAnswersRaw)
  ) {
    Object.entries(selectedAnswersRaw).forEach(([questionId, answer]) => {
      const safeQuestionId = sanitizeCode(questionId, 120);
      const safeAnswer = sanitizeInteger(answer, { min: 0, max: 20 });
      if (!safeQuestionId || safeAnswer === null) return;
      selectedAnswers[safeQuestionId] = safeAnswer;
    });
  }

  return {
    selectedAnswers,
    activeQuestionId: sanitizeCode(value.activeQuestionId, 120) || null,
    updatedAt: sanitizeSingleLineText(value.updatedAt, 64)
  };
};

export const setQuickTestSessionPayload = (
  payload: QuickTestSessionPayload
) => {
  const normalizedPayload = normalizeQuickTestSessionPayload(payload);
  if (!normalizedPayload) return;
  const key = getSessionKey(normalizedPayload.testId);
  const serialized = JSON.stringify(normalizedPayload);
  safeSetStorageItem(getSessionStorage(), key, serialized);
  safeSetStorageItem(getLocalStorage(), key, serialized);
};

export const getQuickTestSessionPayload = (
  testId: string
): QuickTestSessionPayload | null => {
  const key = getSessionKey(testId);
  const fromSession = normalizeQuickTestSessionPayload(
    safeParseJson<QuickTestSessionPayload>(
      safeGetStorageItem(getSessionStorage(), key)
    )
  );
  if (fromSession) return fromSession;

  return normalizeQuickTestSessionPayload(
    safeParseJson<QuickTestSessionPayload>(
      safeGetStorageItem(getLocalStorage(), key)
    )
  );
};

export const setQuickTestProgress = (
  testId: string,
  progress: QuickTestProgress
) => {
  const normalizedProgress = normalizeQuickTestProgress(progress);
  if (!normalizedProgress) return;
  const key = getProgressKey(testId);
  const serialized = JSON.stringify(normalizedProgress);
  safeSetStorageItem(getSessionStorage(), key, serialized);
  safeSetStorageItem(getLocalStorage(), key, serialized);
};

export const getQuickTestProgress = (
  testId: string
): QuickTestProgress | null => {
  const key = getProgressKey(testId);
  const fromSession = normalizeQuickTestProgress(
    safeParseJson<QuickTestProgress>(
      safeGetStorageItem(getSessionStorage(), key)
    )
  );
  if (fromSession) return fromSession;

  return normalizeQuickTestProgress(
    safeParseJson<QuickTestProgress>(safeGetStorageItem(getLocalStorage(), key))
  );
};

export const clearQuickTestProgress = (testId: string) => {
  const key = getProgressKey(testId);
  safeRemoveStorageItem(getSessionStorage(), key);
  safeRemoveStorageItem(getLocalStorage(), key);
};
