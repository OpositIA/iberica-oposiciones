import { Skeleton } from "@/components/ui/skeleton";

const sectionClassName =
  "rounded-[1.75rem] border border-border/70 bg-background/95 p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] md:p-8 dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";

const panelClassName =
  "rounded-[1.5rem] border border-border/70 bg-background/95 p-5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.24)] dark:shadow-[0_22px_50px_-40px_rgba(0,0,0,0.44)]";

const insetPanelClassName =
  "rounded-[1.4rem] border border-border/70 bg-secondary/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";

const dashboardPanelClassName =
  "rounded-[1.75rem] border border-border/70 bg-background/95 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] dark:bg-card/95 dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";

const dashboardChartSurfaceClassName =
  "rounded-[1.5rem] border border-primary/10 bg-gradient-to-b from-primary/[0.08] via-background to-background p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:from-primary/[0.14] dark:via-card dark:to-secondary/20";

const SkeletonPill = ({ className }: { className?: string }) => (
  <Skeleton className={`h-6 rounded-full ${className ?? ""}`} />
);

const SkeletonLines = ({ lines }: { lines: Array<string> }) => (
  <div className="space-y-2.5">
    {lines.map((className, index) => (
      <Skeleton className={`h-4 rounded-full ${className}`} key={index} />
    ))}
  </div>
);

const DashboardKpiCardSkeleton = () => (
  <article
    className={`${dashboardPanelClassName} relative h-full overflow-hidden px-5 py-4 md:px-6 md:py-5`}
  >
    <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-2xl" />
        <Skeleton className="h-4 w-40 rounded-full" />
      </div>
      <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
    </div>
    <Skeleton className="mt-4 h-3.5 w-44 rounded-full" />
  </article>
);

const DashboardChartHeaderSkeleton = ({
  compact = false
}: {
  compact?: boolean;
}) => (
  <div
    className={`mb-5 flex flex-col gap-4 ${compact ? "sm:flex-row sm:items-start sm:justify-between" : "lg:flex-row lg:items-start lg:justify-between"}`}
  >
    <div className="space-y-2">
      <Skeleton className="h-3 w-24 rounded-full" />
      <Skeleton className="h-8 w-48 rounded-2xl" />
    </div>
    <div className="grid grid-cols-2 gap-2 sm:min-w-[250px]">
      <div className="rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 dark:bg-background/60">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="mt-2 h-6 w-14 rounded-xl" />
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 dark:bg-background/60">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="mt-2 h-6 w-14 rounded-xl" />
      </div>
    </div>
  </div>
);

export const PlansPageSkeleton = () => (
  <div className="space-y-6">
    <section className="rounded-[1.5rem] border border-border/70 bg-background/92 p-5 shadow-[0_0_0_1px_hsl(var(--foreground)/0.04),0_18px_44px_-38px_rgba(15,23,42,0.2)] md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <SkeletonPill className="w-32" />
          <Skeleton className="mt-4 h-10 w-52 rounded-2xl" />
          <div className="mt-3 max-w-xl space-y-2.5">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-10/12 rounded-full" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <SkeletonPill className="w-40" />
            <SkeletonPill className="w-32" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:min-w-[22rem]">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1.1rem] border border-border/70 bg-secondary/20 px-4 py-3.5"
            >
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="mt-2 h-7 w-20 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </section>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => {
        const isFeatured = index === 1;

        return (
          <article
            key={index}
            className={`relative flex min-h-[430px] flex-col overflow-hidden rounded-[1.5rem] border p-5 md:p-6 ${
              isFeatured
                ? "border-primary/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(15,23,42,0.92))] shadow-[0_24px_60px_-44px_rgba(15,23,42,0.86)]"
                : "border-foreground/15 bg-background/88 shadow-[0_0_0_1px_hsl(var(--foreground)/0.04),0_18px_44px_-38px_rgba(15,23,42,0.28)]"
            }`}
          >
            {isFeatured ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute right-4 top-4">
                  <SkeletonPill className="app-skeleton-inverse w-24" />
                </div>
              </>
            ) : (
              <div className="pointer-events-none absolute -left-8 top-0 h-24 w-24 rounded-full bg-primary/10 blur-3xl dark:bg-primary/12" />
            )}

            <div className="max-w-sm">
              <Skeleton
                className={`h-3 w-24 rounded-full ${
                  isFeatured ? "app-skeleton-inverse" : "app-skeleton-strong"
                }`}
              />
              <div className="mt-3 flex items-start justify-between gap-4">
                <div className="space-y-2.5">
                  <Skeleton
                    className={`h-9 w-36 rounded-2xl ${
                      isFeatured
                        ? "app-skeleton-inverse"
                        : "app-skeleton-strong"
                    }`}
                  />
                  <Skeleton
                    className={`h-3 w-20 rounded-full ${
                      isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"
                    }`}
                  />
                </div>
                <div className="space-y-2.5">
                  <Skeleton
                    className={`h-10 w-28 rounded-2xl ${
                      isFeatured
                        ? "app-skeleton-inverse"
                        : "app-skeleton-strong"
                    }`}
                  />
                  <Skeleton
                    className={`ml-auto h-3 w-14 rounded-full ${
                      isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"
                    }`}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <Skeleton
                  className={`h-4 w-full rounded-full ${
                    isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"
                  }`}
                />
                <Skeleton
                  className={`h-4 w-10/12 rounded-full ${
                    isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"
                  }`}
                />
              </div>
            </div>

            <div className="mt-6 flex-1 space-y-2.5 border-t border-current/12 pt-5">
              {Array.from({ length: 4 }).map((__, featureIndex) => (
                <div className="flex items-start gap-2.5" key={featureIndex}>
                  <Skeleton
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${
                      isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"
                    }`}
                  />
                  <Skeleton
                    className={`h-4 rounded-full ${
                      featureIndex === 3
                        ? "w-7/12"
                        : featureIndex === 2
                          ? "w-9/12"
                          : "w-11/12"
                    } ${isFeatured ? "app-skeleton-inverse" : "app-skeleton-soft"}`}
                  />
                </div>
              ))}
            </div>

            <Skeleton
              className={`mt-6 h-10 w-full rounded-xl ${
                isFeatured ? "app-skeleton-inverse" : "app-skeleton-strong"
              }`}
            />
          </article>
        );
      })}
    </div>
  </div>
);

export const ProfileSyllabusPageSkeleton = () => (
  <div className="space-y-4">
    <section className={sectionClassName}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="mt-3 h-10 w-56 rounded-2xl" />
          <div className="mt-4 max-w-2xl space-y-2.5">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-10/12 rounded-full" />
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-border/70 bg-secondary/20 px-4 py-3 lg:min-w-[260px]">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="mt-3 h-5 w-40 rounded-full" />
          <Skeleton className="mt-2 h-4 w-24 rounded-full" />
          <SkeletonPill className="mt-4 w-28" />
        </div>
      </div>
    </section>

    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/95 px-4 shadow-[0_20px_44px_-36px_rgba(15,23,42,0.28)] dark:shadow-[0_22px_50px_-40px_rgba(0,0,0,0.52)]"
        >
          <div className="flex min-w-0 items-center gap-4 py-5 pr-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton
                className={`h-5 rounded-full ${index % 2 === 0 ? "w-8/12" : "w-10/12"}`}
              />
              <Skeleton className="h-4 w-5/12 rounded-full" />
            </div>
          </div>

          <div className="pb-5">
            <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-secondary/15 p-4">
              {Array.from({ length: 3 }).map((__, itemIndex) => (
                <div
                  key={itemIndex}
                  className="flex items-center justify-between gap-4 rounded-[1rem] border border-border/60 bg-background/80 p-3.5"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Skeleton className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full" />
                    <Skeleton
                      className={`h-4 rounded-full ${
                        itemIndex === 2 ? "w-7/12" : "w-10/12"
                      }`}
                    />
                  </div>
                  <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ProfileTestPageSkeleton = () => (
  <div className="space-y-4">
    <section className={sectionClassName}>
      <Skeleton className="h-3 w-20 rounded-full" />
      <Skeleton className="mt-3 h-9 w-52 rounded-2xl" />
      <div className="mt-4 max-w-2xl space-y-2.5">
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-4 w-10/12 rounded-full" />
      </div>
      <SkeletonPill className="mt-5 w-72" />
    </section>

    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div className={`${panelClassName} flex h-full flex-col`} key={index}>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-2xl" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
            <SkeletonLines lines={["w-11/12", "w-8/12"]} />
            {index === 1 ? (
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-9/12 rounded-full" />
                <Skeleton className="h-4 w-7/12 rounded-full" />
              </div>
            ) : null}
          </div>
          <Skeleton className="mt-8 h-11 w-full rounded-full" />
        </div>
      ))}
    </section>
  </div>
);

export const MyProfilePageSkeleton = () => (
  <div className="space-y-6">
    <section className={sectionClassName}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="h-24 w-24 shrink-0 rounded-[1.75rem]" />
          <div className="space-y-3">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-10 w-56 rounded-2xl" />
            <SkeletonLines lines={["w-full", "w-10/12"]} />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-full lg:w-48" />
      </div>
    </section>

    <section className={sectionClassName}>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-48 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="mb-2 h-3 w-24 rounded-full" />
            <Skeleton
              className={`h-12 rounded-2xl ${index === 4 ? "w-full md:max-w-[calc(50%-0.5rem)]" : "w-full"}`}
            />
          </div>
        ))}
      </div>
    </section>

    <section className={sectionClassName}>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-56 rounded-2xl" />
      </div>
      <div className={insetPanelClassName}>
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="mt-3 h-6 w-64 rounded-xl" />
        <Skeleton className="mt-5 mb-2 h-3 w-32 rounded-full" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <SkeletonLines lines={["mt-4 w-full", "w-10/12"]} />
        <Skeleton className="mt-4 h-11 w-40 rounded-full" />
      </div>
    </section>

    <section className={sectionClassName}>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-52 rounded-2xl" />
      </div>
      <div className={insetPanelClassName}>
        <SkeletonLines lines={["w-full", "w-9/12"]} />
        <Skeleton className="mt-4 h-11 w-48 rounded-full" />
      </div>
    </section>
  </div>
);

export const DashboardPageSkeleton = () => (
  <div className="space-y-6">
    <section
      className={`${dashboardPanelClassName} relative overflow-hidden bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8 dark:from-primary/[0.14] dark:via-card dark:to-card`}
    >
      <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <SkeletonPill className="w-28" />
          <Skeleton className="h-10 w-72 rounded-2xl" />
          <SkeletonLines lines={["w-full", "w-10/12"]} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <DashboardKpiCardSkeleton key={index} />
      ))}
    </section>

    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:items-start">
      <article
        className={`${dashboardPanelClassName} overflow-hidden p-5 md:p-6 xl:col-span-7`}
      >
        <DashboardChartHeaderSkeleton />
        <div className={dashboardChartSurfaceClassName}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-36 rounded-full" />
          </div>
          <div className="relative h-[220px] w-full overflow-hidden rounded-[1.2rem] border border-border/50 bg-background/60 px-4 py-5">
            <div className="absolute inset-x-4 top-5 bottom-5 flex items-end gap-3">
              {[40, 72, 58, 84, 66, 92].map((height, index) => (
                <Skeleton
                  className="flex-1 rounded-t-[1.2rem] rounded-b-md"
                  key={index}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </article>

      <article
        className={`${dashboardPanelClassName} overflow-hidden p-5 md:p-6 xl:col-span-5`}
      >
        <DashboardChartHeaderSkeleton compact />
        <div className={dashboardChartSurfaceClassName}>
          <div className="relative h-[248px] w-full overflow-hidden rounded-[1.2rem] border border-border/50 bg-background/60 px-4 py-5">
            <div className="absolute inset-x-4 bottom-5 flex items-end gap-3">
              {[58, 78, 46, 86, 68, 74].map((height, index) => (
                <Skeleton
                  className="flex-1 rounded-t-[1.1rem] rounded-b-md"
                  key={index}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </article>

      <article
        className={`${dashboardPanelClassName} overflow-hidden p-5 md:col-span-2 md:p-6 xl:col-span-12`}
      >
        <DashboardChartHeaderSkeleton />
        <div
          className={`${dashboardChartSurfaceClassName} grid items-center gap-4 lg:grid-cols-[220px_minmax(0,1fr)]`}
        >
          <div className="mx-auto flex h-[220px] w-full max-w-[220px] items-center justify-center">
            <div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full border-[18px] border-muted/70">
              <div className="h-[86px] w-[86px] rounded-full border border-border/60 bg-background/80" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4 dark:bg-background/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-10 rounded-2xl" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-10 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>

    <section
      className={`${dashboardPanelClassName} overflow-hidden p-5 md:p-6`}
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-8 w-40 rounded-2xl" />
        </div>
        <SkeletonPill className="w-32" />
      </div>

      <div className="overflow-hidden rounded-[1.35rem] border border-border/70">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.9fr_1fr_0.8fr] gap-0 bg-secondary/35 px-4 py-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton className="h-3 w-16 rounded-full" key={index} />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, rowIndex) => (
              <div
                className="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.9fr_1fr_0.8fr] items-center gap-0 border-t border-border/60 px-4 py-3"
                key={rowIndex}
              >
                <Skeleton className="h-4 w-11/12 rounded-full" />
                <Skeleton className="h-4 w-9/12 rounded-full" />
                <Skeleton className="h-4 w-10 rounded-full" />
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-4 w-14 rounded-full" />
                <SkeletonPill className="w-24" />
                <Skeleton className="h-9 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  </div>
);
