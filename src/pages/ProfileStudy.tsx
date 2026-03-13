import { useStudyTimer } from "@/study/StudyTimerProvider";
import { Pause, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const TIMER_RING_RADIUS = 118;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;

const ProfileStudy = () => {
  const { t } = useTranslation(["profile"]);
  const {
    durationSeconds,
    remainingSeconds,
    status,
    phase,
    start,
    pause,
    resume,
    formattedRemaining
  } = useStudyTimer();

  const completionRatio = useMemo(() => {
    if (durationSeconds <= 0) return 0;
    return Math.min(
      1,
      Math.max(0, (durationSeconds - remainingSeconds) / durationSeconds)
    );
  }, [durationSeconds, remainingSeconds]);

  const ringOffset = useMemo(
    () => TIMER_RING_CIRCUMFERENCE * (1 - completionRatio),
    [completionRatio]
  );

  const [minutesDisplay, secondsDisplay] = formattedRemaining.split(":");
  const isBreakPhase = phase !== "focus";

  const countdownHint = useMemo(() => {
    if (status === "running") return t("profile:study.tapHintRunning");
    if (status === "paused") return t("profile:study.tapHintPaused");
    return t("profile:study.tapHintIdle");
  }, [status, t]);

  const handleCountdownClick = () => {
    if (status === "running") {
      pause();
      return;
    }

    if (status === "paused") {
      resume();
      return;
    }

    start();
  };

  return (
    <section className="relative overflow-hidden rounded-[2.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.9))] shadow-[0_28px_80px_-58px_rgba(15,23,42,0.52)] dark:border-border/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.94))] dark:shadow-[0_34px_90px_-60px_rgba(0,0,0,0.84)]">
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          isBreakPhase ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_56%)] dark:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_56%)]" />
        <Sparkles className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 text-accent/10 dark:text-accent/18" />
      </div>

      <button
        type="button"
        onClick={handleCountdownClick}
        className="group relative flex min-h-[74vh] w-full items-center justify-center px-6 py-10 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        aria-label={countdownHint}
        title={countdownHint}
      >
        <div className="relative flex h-[20rem] w-[20rem] items-center justify-center md:h-[24rem] md:w-[24rem]">
          <svg
            viewBox="0 0 280 280"
            className={`h-full w-full -rotate-90 transition-transform duration-300 group-hover:scale-[1.01] ${
              status === "running"
                ? "drop-shadow-[0_0_24px_rgba(249,115,22,0.16)] dark:drop-shadow-[0_0_24px_rgba(56,189,248,0.2)]"
                : ""
            }`}
            aria-hidden="true"
          >
            <circle
              cx="140"
              cy="140"
              r={TIMER_RING_RADIUS}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="14"
              strokeOpacity="0.42"
            />
            <circle
              cx="140"
              cy="140"
              r={TIMER_RING_RADIUS}
              fill="none"
              stroke={isBreakPhase ? "hsl(var(--accent))" : "hsl(var(--primary))"}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={TIMER_RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              className="transition-all duration-500 ease-out"
            />
          </svg>

          <div className="absolute inset-[1.6rem] rounded-full border border-border/70 bg-background/90 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.5)] backdrop-blur transition-colors duration-300 group-hover:bg-background dark:border-border/80 dark:bg-background/86 dark:shadow-[0_28px_60px_-42px_rgba(0,0,0,0.72)]" />

          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            {isBreakPhase ? (
              <Sparkles className="mb-6 h-8 w-8 text-accent/65 dark:text-accent/75" />
            ) : null}

            <div className="flex items-end justify-center gap-2 text-foreground">
              <span className="text-7xl font-serif leading-none md:text-8xl">
                {minutesDisplay}
              </span>
              <span className="pb-2 text-4xl font-serif leading-none text-foreground/40 md:text-5xl">
                :
              </span>
              <span className="text-7xl font-serif leading-none md:text-8xl">
                {secondsDisplay}
              </span>
            </div>

            {status === "paused" ? (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-foreground dark:border-border/80 dark:bg-background/65">
                <Pause className="h-3.5 w-3.5" />
                {t("profile:study.statusPaused")}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    </section>
  );
};

export default ProfileStudy;
