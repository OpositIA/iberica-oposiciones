import { useStudyTimer } from "@/study/StudyTimerProvider";
import { Pause, Play, Square, TimerReset } from "lucide-react";
import { ChangeEvent, useMemo } from "react";
import { useTranslation } from "react-i18next";

const ProfileStudy = () => {
  const { t } = useTranslation(["profile"]);
  const {
    durationSeconds,
    remainingSeconds,
    status,
    setDurationMinutes,
    start,
    pause,
    resume,
    stop,
    formattedRemaining
  } = useStudyTimer();

  const durationMinutes = useMemo(
    () => Math.max(1, Math.round(durationSeconds / 60)),
    [durationSeconds]
  );

  const onDurationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const minutes = Number(event.target.value);
    if (!Number.isFinite(minutes)) return;
    setDurationMinutes(minutes);
  };

  const statusLabel = useMemo(() => {
    if (status === "running") return t("profile:study.statusRunning");
    if (status === "paused") return t("profile:study.statusPaused");
    if (status === "finished") return t("profile:study.statusFinished");
    return t("profile:study.statusIdle");
  }, [status, t]);

  return (
    <div className="space-y-4">
      <section className="border border-border bg-background/95 p-6 md:p-8">
        <h2 className="text-2xl md:text-3xl font-serif text-foreground">
          {t("profile:study.badge")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("profile:study.description")}
        </p>
      </section>

      <section className="border border-border bg-background p-5 md:p-6">
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)] md:items-end">
          <div>
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
              {t("profile:study.durationLabel")}
            </label>
            <input
              type="number"
              min={1}
              max={480}
              step={1}
              value={durationMinutes}
              onChange={onDurationChange}
              disabled={status === "running"}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("profile:study.durationHint")}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              {t("profile:study.remainingLabel")}
            </p>
            <p className="mt-1 text-4xl font-serif text-foreground">
              {formattedRemaining}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{statusLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "running" ? (
            <button
              type="button"
              onClick={pause}
              className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
            >
              <Pause className="h-4 w-4" />
              {t("profile:study.pause")}
            </button>
          ) : (
            <button
              type="button"
              onClick={status === "paused" ? resume : start}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              <Play className="h-4 w-4" />
              {status === "paused"
                ? t("profile:study.resume")
                : t("profile:study.start")}
            </button>
          )}

          <button
            type="button"
            onClick={stop}
            disabled={status === "idle"}
            className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Square className="h-4 w-4" />
            {t("profile:study.stop")}
          </button>

          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors"
          >
            <TimerReset className="h-4 w-4" />
            {t("profile:study.restart")}
          </button>
        </div>

        {status === "finished" && (
          <div className="mt-4 rounded-xl border border-primary/35 bg-primary/10 p-3 text-sm text-foreground">
            {t("profile:study.finishedMessage")}
          </div>
        )}

        {remainingSeconds === 0 && status === "idle" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("profile:study.readyHint")}
          </p>
        )}
      </section>
    </div>
  );
};

export default ProfileStudy;
