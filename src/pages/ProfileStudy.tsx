import CustomButton from "@/components/ui/custom-button";
import Reveal from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { useStudyTimer } from "@/study/StudyTimerProvider";
import { Pause, SkipForward, Sparkles, TimerReset } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

const TIMER_RING_RADIUS = 118;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;
const PHASE_STEP_COUNT = 8;

const ProfileStudy = () => {
  const { t } = useTranslation(["profile"]);
  const {
    durationSeconds,
    remainingSeconds,
    status,
    phase,
    completedFocusSessions,
    start,
    pause,
    resume,
    restart,
    skipPhase,
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

  const activePhaseStepIndex = useMemo(() => {
    if (phase === "longBreak") return PHASE_STEP_COUNT - 1;
    if (phase === "shortBreak")
      return Math.max(0, ((completedFocusSessions - 1) % 4) * 2 + 1);

    return (completedFocusSessions % 4) * 2;
  }, [completedFocusSessions, phase]);

  const [minutesDisplay, secondsDisplay] = formattedRemaining.split(":");
  const isBreakPhase = phase !== "focus";
  const phaseLabel = t(`profile:study.phase${phase}`);
  const statusLabel = useMemo(() => {
    if (status === "running") return t("profile:study.statusRunning");
    if (status === "paused") return t("profile:study.statusPaused");
    if (status === "finished") return t("profile:study.statusFinished");
    return t("profile:study.statusIdle");
  }, [status, t]);

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
    <Reveal
      as="section"
      className="relative h-full min-h-0 overflow-hidden rounded-[1.75rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.9))] shadow-[0_24px_70px_-58px_rgba(15,23,42,0.52)] dark:border-border/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.94))] dark:shadow-[0_30px_80px_-62px_rgba(0,0,0,0.84)]"
      duration={620}
      variant="gentle"
    >
      <div className="relative flex h-full min-h-0 flex-col gap-3 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("profile:layout.menuItems.study")}
            </h1>
            <p className="mt-1 hidden max-w-xl text-sm leading-6 text-muted-foreground xl:block">
              {t("profile:study.description")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-sm backdrop-blur">
              {t("profile:study.autoCycle")}
            </div>
            <CustomButton
              type="button"
              onClick={restart}
              styleType="subtle"
              radius="full"
              size="sm"
              className="min-w-[9rem] justify-center border-primary/20 bg-background/85 text-foreground shadow-[0_18px_34px_-28px_rgba(15,23,42,0.72)] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10"
              aria-label={t("profile:study.restart")}
            >
              <TimerReset className="h-3.5 w-3.5" />
              {t("profile:study.restart")}
            </CustomButton>
          </div>
        </div>

        <div className="grid shrink-0 gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5 shadow-[0_16px_34px_-32px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("profile:study.phaseLabel")}
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {phaseLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5 shadow-[0_16px_34px_-32px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("profile:study.remainingLabel")}
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {formattedRemaining}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5 shadow-[0_16px_34px_-32px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("profile:study.statusLabel")}
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-2 py-2 text-center">
          <div
            className="flex h-4 items-center justify-center gap-1.5"
            aria-label={t("profile:study.phaseProgressLabel", {
              phase: phaseLabel
            })}
          >
            {Array.from({ length: PHASE_STEP_COUNT }, (_, index) => {
              const isActive = index === activePhaseStepIndex;
              const isComplete = index < activePhaseStepIndex;
              const isBreakStep = index % 2 === 1;

              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    isActive ? "w-4" : "w-1.5",
                    isActive && (isBreakStep ? "bg-accent" : "bg-primary"),
                    isComplete &&
                      (isBreakStep ? "bg-accent/75" : "bg-primary/85"),
                    !isActive && !isComplete && "bg-border"
                  )}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCountdownClick}
            className="group relative flex items-center justify-center transition-transform duration-300 ease-out hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            aria-label={countdownHint}
            title={countdownHint}
          >
            <div className="relative flex h-[clamp(13.5rem,42vh,19rem)] w-[clamp(13.5rem,42vh,19rem)] items-center justify-center transition-transform duration-300 ease-out group-hover:scale-[1.018] md:h-[clamp(15rem,44vh,20.5rem)] md:w-[clamp(15rem,44vh,20.5rem)]">
              <div
                aria-hidden="true"
                className={cn(
                  "study-timer-breath-aura absolute -inset-2 rounded-full border border-primary/18 opacity-0 shadow-[0_0_0_1px_hsl(var(--primary)/0.08),0_0_56px_hsl(var(--primary)/0.14)] transition-opacity duration-500 dark:border-accent/22 dark:shadow-[0_0_0_1px_hsl(var(--accent)/0.1),0_0_62px_hsl(var(--accent)/0.18)]",
                  status === "running" && "opacity-100"
                )}
              />
              <svg
                viewBox="0 0 280 280"
                className={cn(
                  "h-full w-full -rotate-90 transition-transform duration-300 ease-out",
                  status === "running" &&
                    "drop-shadow-[0_0_24px_rgba(249,115,22,0.16)] dark:drop-shadow-[0_0_24px_rgba(56,189,248,0.2)]"
                )}
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
                  stroke={
                    isBreakPhase ? "hsl(var(--accent))" : "hsl(var(--primary))"
                  }
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={TIMER_RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  className="transition-all duration-500 ease-out"
                />
              </svg>

              <div className="absolute inset-[1.35rem] rounded-full border border-border/70 bg-background/90 shadow-[0_24px_52px_-40px_rgba(15,23,42,0.5)] backdrop-blur transition-all duration-300 ease-out group-hover:scale-[1.015] group-hover:bg-background group-hover:shadow-[0_30px_62px_-44px_rgba(15,23,42,0.54)] dark:border-border/80 dark:bg-background/86 dark:shadow-[0_24px_54px_-42px_rgba(0,0,0,0.72)] dark:group-hover:shadow-[0_30px_64px_-46px_rgba(0,0,0,0.82)]" />

              <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
                {isBreakPhase ? (
                  <Sparkles className="mb-4 h-6 w-6 text-accent/65 dark:text-accent/75" />
                ) : null}

                <div className="flex items-center justify-center gap-2 text-foreground">
                  <span className="text-5xl font-serif leading-none md:text-7xl">
                    {minutesDisplay}
                  </span>
                  <span className="pb-1.5 text-3xl font-serif leading-none text-foreground/40 md:text-4xl">
                    :
                  </span>
                  <span className="text-5xl font-serif leading-none md:text-7xl">
                    {secondsDisplay}
                  </span>
                </div>

                {status === "paused" ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground dark:border-border/80 dark:bg-background/65">
                    <Pause className="h-3.5 w-3.5" />
                    {t("profile:study.statusPaused")}
                  </div>
                ) : null}
              </div>
            </div>
          </button>

          <CustomButton
            type="button"
            onClick={skipPhase}
            styleType="subtle"
            radius="full"
            size="sm"
            className="border-primary/20 bg-background/82 px-3.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-[0_16px_30px_-26px_rgba(15,23,42,0.55)] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
            aria-label={t("profile:study.skipPhase")}
          >
            <SkipForward className="h-3.5 w-3.5" />
            {t("profile:study.skipPhase")}
          </CustomButton>
        </div>
      </div>
    </Reveal>
  );
};

export default ProfileStudy;
