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
  restart: () => void;
  skipPhase: () => void;
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

const clampDurationSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_FOCUS_DURATION_SECONDS;
  return Math.min(Math.max(Math.floor(value), 60), 8 * 60 * 60);
};

const getPhaseDurationSeconds = (
  phase: StudyTimerPhase,
  focusDurationSeconds: number
) => {
  if (phase === "shortBreak") return SHORT_BREAK_DURATION_SECONDS;
  if (phase === "longBreak") return SHORT_BREAK_DURATION_SECONDS;
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

let timerAudioContext: AudioContext | null = null;

const getTimerAudioContext = () => {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!timerAudioContext || timerAudioContext.state === "closed")
    timerAudioContext = new AudioContextCtor();

  return timerAudioContext;
};

const unlockTimerDoneSound = () => {
  const ctx = getTimerAudioContext();
  if (!ctx || ctx.state !== "suspended") return;

  void ctx.resume().catch(() => undefined);
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
  const ctx = getTimerAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(() => playTimerDoneSound())
      .catch(() => undefined);
    return;
  }

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(1, ctx.currentTime);

  const notes = [
    // ============= FRASE 1 (motivo grave) =============
    // Compás 1 - "Por la ma‑ña‑na"
    { offset: 0.0, frequency: 392.0, duration: 0.2381 }, // Sol4 (Por)
    { offset: 0.2381, frequency: 392.0, duration: 0.2381 }, // Sol4 (la)
    { offset: 0.4762, frequency: 440.0, duration: 0.2381 }, // La4 (ma-)
    { offset: 0.7143, frequency: 392.0, duration: 0.2381 }, // Sol4 (ña-)
    { offset: 0.9524, frequency: 523.25, duration: 0.4762 }, // Do5 (na)

    // "ca‑fé"
    { offset: 1.4286, frequency: 493.88, duration: 0.2381 }, // Si4 (ca-)
    { offset: 1.6667, frequency: 440.0, duration: 0.4762 }, // La4 (fé)

    // Compás 2 - "por la tar‑de"
    { offset: 2.1429, frequency: 349.23, duration: 0.2381 }, // Fa4 (por)
    { offset: 2.381, frequency: 349.23, duration: 0.2381 }, // Fa4 (la)
    { offset: 2.619, frequency: 440.0, duration: 0.2381 }, // La4 (tar-)
    { offset: 2.8571, frequency: 392.0, duration: 0.2381 }, // Sol4 (de)

    // "ron"
    { offset: 3.0952, frequency: 261.63, duration: 0.7143 }, // Do4 (ron, ligado hasta el final del compás)

    // ============= FRASE 2 (variación aguda) =============
    // Compás 3 - "Por la ma‑ña‑na"
    { offset: 3.8095, frequency: 392.0, duration: 0.2381 }, // Sol4 (Por)
    { offset: 4.0476, frequency: 392.0, duration: 0.2381 }, // Sol4 (la)
    { offset: 4.2857, frequency: 440.0, duration: 0.2381 }, // La4 (ma-)
    { offset: 4.5238, frequency: 392.0, duration: 0.2381 }, // Sol4 (ña-)
    { offset: 4.7619, frequency: 523.25, duration: 0.4762 }, // Do5 (na)

    // "ca‑fé"
    { offset: 5.2381, frequency: 587.33, duration: 0.2381 }, // Re5 (ca-)
    { offset: 5.4762, frequency: 659.25, duration: 0.4762 }, // Mi5 (fé)

    // Compás 4 - "por la tar‑de"
    { offset: 5.9524, frequency: 523.25, duration: 0.2381 }, // Do5 (por)
    { offset: 6.1905, frequency: 493.88, duration: 0.2381 }, // Si4 (la)
    { offset: 6.4286, frequency: 440.0, duration: 0.2381 }, // La4 (tar-)
    { offset: 6.6667, frequency: 392.0, duration: 0.2381 }, // Sol4 (de)

    // "ron" (final apoteósico)
    { offset: 6.9048, frequency: 523.25, duration: 0.7143 } // Do5 (ron, cierra el loop)
  ];

  const soundDurationMs =
    Math.ceil(
      Math.max(...notes.map(({ offset, duration }) => offset + duration)) * 1000
    ) + 100;

  notes.forEach(({ offset, frequency, duration }) => {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + offset);
    osc.connect(noteGain);
    noteGain.connect(masterGain);

    const startAt = ctx.currentTime + offset;
    const endAt = startAt + duration;

    noteGain.gain.setValueAtTime(0.0001, startAt);
    noteGain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.start(startAt);
    osc.stop(endAt);
  });

  window.setTimeout(() => {
    masterGain.disconnect();
  }, soundDurationMs);
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
    (
      currentPhase: StudyTimerPhase,
      currentCompletedFocusSessions: number
    ): {
      nextPhase: StudyTimerPhase;
      nextCompletedFocusSessions: number;
    } => {
      if (currentPhase === "focus") {
        return {
          nextPhase: "shortBreak",
          nextCompletedFocusSessions: currentCompletedFocusSessions + 1
        };
      }

      return {
        nextPhase: "focus",
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
    unlockTimerDoneSound();
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
    unlockTimerDoneSound();
    setStatus("running");
    setEndAtMs(Date.now() + remainingSeconds * 1000);
  }, [remainingSeconds, status]);

  const skipPhase = useCallback(() => {
    unlockTimerDoneSound();
    const { nextPhase, nextCompletedFocusSessions } = advancePomodoroPhase(
      phase,
      completedFocusSessions
    );
    const nextDuration = getPhaseDurationSeconds(
      nextPhase,
      focusDurationSeconds
    );

    setPhase(nextPhase);
    setCompletedFocusSessions(nextCompletedFocusSessions);
    setRemainingSeconds(nextDuration);
    setStatus("running");
    setEndAtMs(Date.now() + nextDuration * 1000);
  }, [
    advancePomodoroPhase,
    completedFocusSessions,
    focusDurationSeconds,
    phase
  ]);

  const restart = useCallback(() => {
    const resetDuration = getPhaseDurationSeconds(
      "focus",
      focusDurationSeconds
    );
    setPhase("focus");
    setCompletedFocusSessions(0);
    setStatus("idle");
    setEndAtMs(null);
    setRemainingSeconds(resetDuration);
  }, [focusDurationSeconds]);

  const stop = restart;

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
      restart,
      skipPhase,
      stop,
      formattedRemaining: formatSeconds(remainingSeconds)
    }),
    [
      completedFocusSessions,
      durationSeconds,
      pause,
      phase,
      remainingSeconds,
      restart,
      resume,
      setDurationMinutes,
      skipPhase,
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
