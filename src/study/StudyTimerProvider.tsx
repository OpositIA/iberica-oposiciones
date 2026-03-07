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

type StudyTimerContextValue = {
  durationSeconds: number;
  remainingSeconds: number;
  status: StudyTimerStatus;
  setDurationMinutes: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  formattedRemaining: string;
};

type PersistedStudyTimer = {
  durationSeconds: number;
  remainingSeconds: number;
  status: StudyTimerStatus;
  endAtMs: number | null;
};

const STORAGE_KEY = "study-timer-state-v1";
const DEFAULT_DURATION_SECONDS = 25 * 60;

const clampDurationSeconds = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_DURATION_SECONDS;
  return Math.min(Math.max(Math.floor(value), 60), 8 * 60 * 60);
};

const formatSeconds = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const safeParsePersistedState = (
  rawValue: string | null
): PersistedStudyTimer | null => {
  if (!rawValue) return null;
  if (rawValue.length > 10_000) return null;
  try {
    const parsed = JSON.parse(rawValue) as PersistedStudyTimer;
    const durationSeconds = clampDurationSeconds(parsed.durationSeconds);
    const remainingSeconds = Math.min(
      durationSeconds,
      sanitizeInteger(parsed.remainingSeconds, {
        min: 0,
        max: durationSeconds,
        fallback: durationSeconds
      }) ?? durationSeconds
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
    return {
      durationSeconds,
      remainingSeconds,
      status,
      endAtMs
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

  const [durationSeconds, setDurationSeconds] = useState(
    initialState?.durationSeconds ?? DEFAULT_DURATION_SECONDS
  );
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialState?.remainingSeconds ?? DEFAULT_DURATION_SECONDS
  );
  const [status, setStatus] = useState<StudyTimerStatus>(
    initialState?.status ?? "idle"
  );
  const [endAtMs, setEndAtMs] = useState<number | null>(
    initialState?.endAtMs ?? null
  );
  const lastFinishedAtRef = useRef<number | null>(null);

  const finishCountdown = useCallback(() => {
    setRemainingSeconds(0);
    setStatus("finished");
    setEndAtMs(null);
    const now = Date.now();
    if (lastFinishedAtRef.current && now - lastFinishedAtRef.current < 1000)
      return;
    lastFinishedAtRef.current = now;

    toast({
      title: t("profile:study.toasts.breakTitle"),
      description: t("profile:study.toasts.breakDescription")
    });
    try {
      playTimerDoneSound();
    } catch {
      // noop
    }
  }, [t, toast]);

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
      durationSeconds,
      remainingSeconds,
      status,
      endAtMs
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
  }, [durationSeconds, endAtMs, remainingSeconds, status]);

  const setDurationMinutes = useCallback(
    (minutes: number) => {
      const nextDuration = clampDurationSeconds(minutes * 60);
      setDurationSeconds(nextDuration);
      if (status !== "running") {
        setRemainingSeconds(nextDuration);
        if (status === "finished") setStatus("idle");
      }
    },
    [status]
  );

  const start = useCallback(() => {
    const nextDuration = clampDurationSeconds(durationSeconds);
    setDurationSeconds(nextDuration);
    setRemainingSeconds(nextDuration);
    setStatus("running");
    setEndAtMs(Date.now() + nextDuration * 1000);
  }, [durationSeconds]);

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
    setStatus("idle");
    setEndAtMs(null);
    setRemainingSeconds(durationSeconds);
  }, [durationSeconds]);

  const contextValue = useMemo<StudyTimerContextValue>(
    () => ({
      durationSeconds,
      remainingSeconds,
      status,
      setDurationMinutes,
      start,
      pause,
      resume,
      stop,
      formattedRemaining: formatSeconds(remainingSeconds)
    }),
    [
      durationSeconds,
      pause,
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
