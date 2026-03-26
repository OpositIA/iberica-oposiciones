import CustomButton from "@/components/ui/custom-button";
import { cn } from "@/lib/utils";
import { useStudyTimer } from "@/study/StudyTimerProvider";
import { Pause, Sparkles, TimerReset } from "lucide-react";
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
    restart,
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
    <section className="relative overflow-hidden rounded-[2.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.9))] shadow-[0_28px_80px_-58px_rgba(15,23,42,0.52)] dark:border-border/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.94))] dark:shadow-[0_34px_90px_-60px_rgba(0,0,0,0.84)]">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          isBreakPhase ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_56%)] dark:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_56%)]" />
        <Sparkles className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 text-accent/10 dark:text-accent/18" />
      </div>

      <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              {t("profile:study.badge")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {t("profile:layout.menuItems.study")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              {t("profile:study.description")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-sm backdrop-blur">
              {t("profile:study.autoCycle")}
            </div>
            <CustomButton
              type="button"
              onClick={restart}
              styleType="subtle"
              radius="full"
              className="min-w-[10.5rem] justify-center border-primary/20 bg-background/85 text-foreground shadow-[0_18px_34px_-28px_rgba(15,23,42,0.72)] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10"
              aria-label={t("profile:study.restart")}
            >
              <TimerReset className="h-4 w-4" />
              {t("profile:study.restart")}
            </CustomButton>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("profile:study.phaseLabel")}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {phaseLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("profile:study.remainingLabel")}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {formattedRemaining}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.58)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("profile:study.statusLabel")}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {statusLabel}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCountdownClick}
          className="group relative flex min-h-[60vh] w-full items-center justify-center px-4 py-6 text-center transition-transform duration-300 ease-out hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          aria-label={countdownHint}
          title={countdownHint}
        >
          <div className="relative flex h-[19rem] w-[19rem] items-center justify-center transition-transform duration-300 ease-out group-hover:scale-[1.018] md:h-[23rem] md:w-[23rem]">
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

            <div className="absolute inset-[1.6rem] rounded-full border border-border/70 bg-background/90 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.5)] backdrop-blur transition-all duration-300 ease-out group-hover:scale-[1.015] group-hover:bg-background group-hover:shadow-[0_34px_70px_-44px_rgba(15,23,42,0.54)] dark:border-border/80 dark:bg-background/86 dark:shadow-[0_28px_60px_-42px_rgba(0,0,0,0.72)] dark:group-hover:shadow-[0_34px_72px_-46px_rgba(0,0,0,0.82)]" />

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
      </div>
    </section>
  );
};

export default ProfileStudy;
