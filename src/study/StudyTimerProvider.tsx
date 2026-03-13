import { useToast } from "@/hooks/use-toast";
import { sanitizeInteger } from "@/lib/inputSanitization";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

type StudyTimerStatus = "idle" | "running" | "paused" | "finished";
export type StudyTimerPhase = "focus" | "shortBreak" | "longBreak";

type StudyTimerContextValue = {
  durationSeconds: number;
  remainingSeconds: number;
  status: StudyTimerStatus;
  phase: StudyTimerPhase;
  completedFocusSessions: number;
  setDurationMinutes: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  formattedRemaining: string;
};

type PersistedStudyTimer = {
  focusDurationSeconds?: number;
  durationSeconds?: number;
  remainingSeconds: number;
  status: StudyTimerStatus;
  endAtMs: number | null;
  phase?: StudyTimerPhase;
  completedFocusSessions?: number;
};

const STORAGE_KEY = "study-timer-state-v1";
const DEFAULT_FOCUS_DURATION_SECONDS = 25 * 60;
const SHORT_BREAK_DURATION_SECONDS = 5 * 60;
const LONG_BREAK_DURATION_SECONDS = 15 * 60;
const POMODOROS_BEFORE_LONG_BREAK = 4;

const clampDurationSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_FOCUS_DURATION_SECONDS;
  return Math.min(Math.max(Math.floor(value), 60), 8 * 60 * 60);
};

const getPhaseDurationSeconds = (
  phase: StudyTimerPhase,
  focusDurationSeconds: number
) => {
  if (phase === "shortBreak") return SHORT_BREAK_DURATION_SECONDS;
  if (phase === "longBreak") return LONG_BREAK_DURATION_SECONDS;
  return focusDurationSeconds;
};

const formatSeconds = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const normalizePhase = (value: unknown): StudyTimerPhase => {
  if (value === "shortBreak" || value === "longBreak" || value === "focus")
    return value;
  return "focus";
};

const safeParsePersistedState = (
  rawValue: string | null
): PersistedStudyTimer | null => {
  if (!rawValue) return null;
  if (rawValue.length > 10_000) return null;

  try {
    const parsed = JSON.parse(rawValue) as PersistedStudyTimer;
    const phase = normalizePhase(parsed.phase);
    const fallbackFocusDuration = clampDurationSeconds(
      parsed.focusDurationSeconds ??
        parsed.durationSeconds ??
        DEFAULT_FOCUS_DURATION_SECONDS
    );
    const phaseDuration = getPhaseDurationSeconds(phase, fallbackFocusDuration);
    const remainingSeconds = Math.min(
      phaseDuration,
      sanitizeInteger(parsed.remainingSeconds, {
        min: 0,
        max: phaseDuration,
        fallback: phaseDuration
      }) ?? phaseDuration
    );
    const status: StudyTimerStatus =
      parsed.status === "running" ||
      parsed.status === "paused" ||
      parsed.status === "finished"
        ? parsed.status
        : "idle";
    const endAtMs =
      parsed.endAtMs == null
        ? null
        : sanitizeInteger(parsed.endAtMs, {
            min: 0,
            max: Number.MAX_SAFE_INTEGER
          });
    const completedFocusSessions =
      sanitizeInteger(parsed.completedFocusSessions, {
        min: 0,
        max: 999,
        fallback: 0
      }) ?? 0;

    const normalizedFocusDurationSeconds = DEFAULT_FOCUS_DURATION_SECONDS;
    const shouldResetToDefaultFocus =
      phase === "focus" && (status === "idle" || status === "finished");

    return {
      focusDurationSeconds: normalizedFocusDurationSeconds,
      remainingSeconds: shouldResetToDefaultFocus
        ? normalizedFocusDurationSeconds
        : remainingSeconds,
      status,
      endAtMs,
      phase,
      completedFocusSessions
    };
  } catch {
    return null;
  }
};

const playTimerDoneSound = () => {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0.0001;

  const beeps = [0, 0.28, 0.56];
  beeps.forEach((offset, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = index === beeps.length - 1 ? 880 : 660;
    osc.connect(gain);
    const startAt = ctx.currentTime + offset;
    const endAt = startAt + 0.16;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(startAt);
    osc.stop(endAt);
  });

  window.setTimeout(() => {
    void ctx.close().catch(() => undefined);
  }, 1300);
};

const StudyTimerContext = createContext<StudyTimerContextValue | null>(null);

export const StudyTimerProvider = ({ children }: PropsWithChildren) => {
  const { t } = useTranslation(["profile"]);
  const { toast } = useToast();
  const initialState = useMemo(
    () => safeParsePersistedState(window.localStorage.getItem(STORAGE_KEY)),
    []
  );

  const [focusDurationSeconds, setFocusDurationSeconds] = useState(
    initialState?.focusDurationSeconds ?? DEFAULT_FOCUS_DURATION_SECONDS
  );
  const [phase, setPhase] = useState<StudyTimerPhase>(
    initialState?.phase ?? "focus"
  );
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialState?.remainingSeconds ?? DEFAULT_FOCUS_DURATION_SECONDS
  );
  const [status, setStatus] = useState<StudyTimerStatus>(
    initialState?.status ?? "idle"
  );
  const [endAtMs, setEndAtMs] = useState<number | null>(
    initialState?.endAtMs ?? null
  );
  const [completedFocusSessions, setCompletedFocusSessions] = useState(
    initialState?.completedFocusSessions ?? 0
  );
  const lastFinishedAtRef = useRef<number | null>(null);

  const durationSeconds = useMemo(
    () => getPhaseDurationSeconds(phase, focusDurationSeconds),
    [focusDurationSeconds, phase]
  );

  const advancePomodoroPhase = useCallback(
    (currentPhase: StudyTimerPhase, currentCompletedFocusSessions: number) => {
      if (currentPhase === "focus") {
        const nextCompletedFocusSessions = currentCompletedFocusSessions + 1;
        const nextPhase =
          nextCompletedFocusSessions % POMODOROS_BEFORE_LONG_BREAK === 0
            ? "longBreak"
            : "shortBreak";

        return {
          nextPhase,
          nextCompletedFocusSessions
        };
      }

      return {
        nextPhase: "focus" as StudyTimerPhase,
        nextCompletedFocusSessions: currentCompletedFocusSessions
      };
    },
    []
  );

  const finishCountdown = useCallback(() => {
    const now = Date.now();
    const currentPhase = phase;
    const currentCompletedFocusSessions = completedFocusSessions;
    const { nextPhase, nextCompletedFocusSessions } = advancePomodoroPhase(
      currentPhase,
      currentCompletedFocusSessions
    );
    const nextDurationSeconds = getPhaseDurationSeconds(
      nextPhase,
      focusDurationSeconds
    );

    setPhase(nextPhase);
    setRemainingSeconds(nextDurationSeconds);
    setCompletedFocusSessions(nextCompletedFocusSessions);
    setStatus("running");
    setEndAtMs(Date.now() + nextDurationSeconds * 1000);

    if (lastFinishedAtRef.current && now - lastFinishedAtRef.current < 1000)
      return;
    lastFinishedAtRef.current = now;

    const nextPhaseLabel = t(`profile:study.phase${nextPhase}`);
    const toastTitle =
      currentPhase === "focus"
        ? t("profile:study.toasts.focusCompleteTitle")
        : t("profile:study.toasts.breakCompleteTitle");
    const toastDescription =
      currentPhase === "focus"
        ? t("profile:study.toasts.focusCompleteDescription", {
            nextPhase: nextPhaseLabel
          })
        : t("profile:study.toasts.breakCompleteDescription", {
            nextPhase: nextPhaseLabel
          });

    toast({
      title: toastTitle,
      description: toastDescription
    });

    try {
      playTimerDoneSound();
    } catch {
      // noop
    }
  }, [
    advancePomodoroPhase,
    completedFocusSessions,
    focusDurationSeconds,
    phase,
    t,
    toast
  ]);

  useEffect(() => {
    if (status !== "running" || !endAtMs) return;

    const tick = () => {
      const nextRemaining = Math.ceil((endAtMs - Date.now()) / 1000);
      if (nextRemaining <= 0) {
        finishCountdown();
        return;
      }
      setRemainingSeconds(nextRemaining);
    };

    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [endAtMs, finishCountdown, status]);

  useEffect(() => {
    const persistedState: PersistedStudyTimer = {
      focusDurationSeconds,
      durationSeconds,
      remainingSeconds,
      status,
      endAtMs,
      phase,
      completedFocusSessions
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
  }, [
    completedFocusSessions,
    durationSeconds,
    endAtMs,
    focusDurationSeconds,
    phase,
    remainingSeconds,
    status
  ]);

  const setDurationMinutes = useCallback(
    (minutes: number) => {
      const nextFocusDuration = clampDurationSeconds(minutes * 60);
      setFocusDurationSeconds(nextFocusDuration);

      if (phase === "focus" && status !== "running") {
        setRemainingSeconds(nextFocusDuration);
        if (status === "finished") setStatus("idle");
      }
    },
    [phase, status]
  );

  const start = useCallback(() => {
    const nextDuration = getPhaseDurationSeconds(phase, focusDurationSeconds);
    setRemainingSeconds(nextDuration);
    setStatus("running");
    setEndAtMs(Date.now() + nextDuration * 1000);
  }, [focusDurationSeconds, phase]);

  const pause = useCallback(() => {
    if (status !== "running") return;
    const nextRemaining = endAtMs
      ? Math.ceil((endAtMs - Date.now()) / 1000)
      : remainingSeconds;
    setRemainingSeconds(Math.max(0, nextRemaining));
    setStatus("paused");
    setEndAtMs(null);
  }, [endAtMs, remainingSeconds, status]);

  const resume = useCallback(() => {
    if (status !== "paused" || remainingSeconds <= 0) return;
    setStatus("running");
    setEndAtMs(Date.now() + remainingSeconds * 1000);
  }, [remainingSeconds, status]);

  const stop = useCallback(() => {
    const resetDuration = getPhaseDurationSeconds(
      "focus",
      focusDurationSeconds
    );
    setPhase("focus");
    setStatus("idle");
    setEndAtMs(null);
    setRemainingSeconds(resetDuration);
  }, [focusDurationSeconds]);

  const contextValue = useMemo<StudyTimerContextValue>(
    () => ({
      durationSeconds,
      remainingSeconds,
      status,
      phase,
      completedFocusSessions,
      setDurationMinutes,
      start,
      pause,
      resume,
      stop,
      formattedRemaining: formatSeconds(remainingSeconds)
    }),
    [
      completedFocusSessions,
      durationSeconds,
      pause,
      phase,
      remainingSeconds,
      resume,
      setDurationMinutes,
      start,
      status,
      stop
    ]
  );

  return (
    <StudyTimerContext.Provider value={contextValue}>
      {children}
    </StudyTimerContext.Provider>
  );
};

export const useStudyTimer = () => {
  const context = useContext(StudyTimerContext);
  if (!context)
    throw new Error("useStudyTimer must be used within StudyTimerProvider.");
  return context;
};
