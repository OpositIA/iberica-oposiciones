import CustomButton from "@/components/ui/custom-button";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_TOUR_TARGETS,
  getWorkspaceTourStorageKey
} from "@/lib/workspaceTour";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

type TourCompletionState = "completed" | "pending" | "skipped";
type TourPlacement = "auto" | "bottom" | "left" | "right" | "top";
type TourStep = {
  id: string;
  placement: TourPlacement;
  targetId: string;
};
type RectState = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};
type LayoutState = {
  panelHeight: number;
  panelWidth: number;
  x: number;
  y: number;
  targetRect: RectState;
};
type WorkspaceTourProps = {
  onOpenChange?: (isOpen: boolean) => void;
  userId: string | null;
};

export type WorkspaceTourHandle = {
  start: () => void;
};

const TOUR_ROUTE = "/dashboard";
const PANEL_MAX_WIDTH = 372;
const MOBILE_BREAKPOINT = 768;
const SPOTLIGHT_PADDING = 14;
const VIEWPORT_MARGIN = 16;
const PANEL_GAP = 22;
const MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const TARGET_WAIT_TIMEOUT_MS = 4000;
const TARGET_VISIBILITY_MARGIN = 28;

const TOUR_STEPS: TourStep[] = [
  {
    id: "menuDashboard",
    placement: "right",
    targetId: WORKSPACE_TOUR_TARGETS.menuDashboard
  },
  {
    id: "menuAssistant",
    placement: "right",
    targetId: WORKSPACE_TOUR_TARGETS.menuAssistant
  },
  {
    id: "menuTest",
    placement: "right",
    targetId: WORKSPACE_TOUR_TARGETS.menuTest
  },
  {
    id: "menuSyllabus",
    placement: "right",
    targetId: WORKSPACE_TOUR_TARGETS.menuSyllabus
  },
  {
    id: "menuStudy",
    placement: "right",
    targetId: WORKSPACE_TOUR_TARGETS.menuStudy
  }
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toRectState = (rect: DOMRect, padding = 0): RectState => {
  const left = Math.max(rect.left - padding, 0);
  const top = Math.max(rect.top - padding, 0);
  const right = Math.min(rect.right + padding, window.innerWidth);
  const bottom = Math.min(rect.bottom + padding, window.innerHeight);

  return {
    bottom,
    height: Math.max(bottom - top, 0),
    left,
    right,
    top,
    width: Math.max(right - left, 0)
  };
};

const isRenderableTarget = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;

  return rect.right > 0 && rect.left < window.innerWidth;
};

const findTourTarget = (targetId: string) => {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`)
  );
  if (elements.length === 0) return null;

  const preferredElement =
    elements.find((element) => isRenderableTarget(element)) ?? elements[0];

  return preferredElement instanceof HTMLElement ? preferredElement : null;
};

const waitForTarget = async (targetId: string) => {
  const startTime = window.performance.now();

  return new Promise<HTMLElement | null>((resolve) => {
    const checkTarget = () => {
      const target = findTourTarget(targetId);
      if (target) {
        resolve(target);
        return;
      }

      if (window.performance.now() - startTime >= TARGET_WAIT_TIMEOUT_MS) {
        resolve(null);
        return;
      }

      window.requestAnimationFrame(checkTarget);
    };

    checkTarget();
  });
};

const ensureTargetInView = (
  element: HTMLElement,
  prefersReducedMotion: boolean
) => {
  const rect = element.getBoundingClientRect();
  const isFullyVisible =
    rect.top >= TARGET_VISIBILITY_MARGIN &&
    rect.bottom <= window.innerHeight - TARGET_VISIBILITY_MARGIN &&
    rect.left >= VIEWPORT_MARGIN &&
    rect.right <= window.innerWidth - VIEWPORT_MARGIN;

  if (isFullyVisible) return;

  element.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: rect.height > window.innerHeight * 0.65 ? "start" : "center",
    inline: "nearest"
  });
};

const getPanelWidth = () =>
  Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);

const getPlacementOrder = (preferredPlacement: TourPlacement) => {
  if (preferredPlacement === "auto")
    return ["bottom", "right", "left", "top"] as const;

  const fallbackOrder = ["right", "left", "bottom", "top"].filter(
    (placement) => placement !== preferredPlacement
  ) as Array<Exclude<TourPlacement, "auto">>;

  return [preferredPlacement, ...fallbackOrder] as const;
};

const computeDesktopLayout = (
  targetRect: RectState,
  panelWidth: number,
  panelHeight: number,
  preferredPlacement: TourPlacement
) => {
  const placements = getPlacementOrder(preferredPlacement);
  const maxX = window.innerWidth - panelWidth - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - panelHeight - VIEWPORT_MARGIN;

  for (const placement of placements) {
    if (placement === "right") {
      const x = targetRect.right + PANEL_GAP;
      if (x <= maxX) {
        return {
          x,
          y: clamp(
            targetRect.top + targetRect.height / 2 - panelHeight / 2,
            VIEWPORT_MARGIN,
            maxY
          )
        };
      }
    }

    if (placement === "left") {
      const x = targetRect.left - panelWidth - PANEL_GAP;
      if (x >= VIEWPORT_MARGIN) {
        return {
          x,
          y: clamp(
            targetRect.top + targetRect.height / 2 - panelHeight / 2,
            VIEWPORT_MARGIN,
            maxY
          )
        };
      }
    }

    if (placement === "bottom") {
      const y = targetRect.bottom + PANEL_GAP;
      if (y <= maxY) {
        return {
          x: clamp(
            targetRect.left + targetRect.width / 2 - panelWidth / 2,
            VIEWPORT_MARGIN,
            maxX
          ),
          y
        };
      }
    }

    if (placement === "top") {
      const y = targetRect.top - panelHeight - PANEL_GAP;
      if (y >= VIEWPORT_MARGIN) {
        return {
          x: clamp(
            targetRect.left + targetRect.width / 2 - panelWidth / 2,
            VIEWPORT_MARGIN,
            maxX
          ),
          y
        };
      }
    }
  }

  return {
    x: clamp(
      targetRect.left + targetRect.width / 2 - panelWidth / 2,
      VIEWPORT_MARGIN,
      maxX
    ),
    y: clamp(targetRect.bottom + PANEL_GAP, VIEWPORT_MARGIN, maxY)
  };
};

const layoutsMatch = (current: LayoutState | null, next: LayoutState) => {
  if (!current) return false;

  return (
    Math.abs(current.x - next.x) < 0.5 &&
    Math.abs(current.y - next.y) < 0.5 &&
    Math.abs(current.panelWidth - next.panelWidth) < 0.5 &&
    Math.abs(current.panelHeight - next.panelHeight) < 0.5 &&
    Math.abs(current.targetRect.left - next.targetRect.left) < 0.5 &&
    Math.abs(current.targetRect.top - next.targetRect.top) < 0.5 &&
    Math.abs(current.targetRect.width - next.targetRect.width) < 0.5 &&
    Math.abs(current.targetRect.height - next.targetRect.height) < 0.5
  );
};

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
};

const WorkspaceTour = forwardRef<WorkspaceTourHandle, WorkspaceTourProps>(
  ({ onOpenChange, userId }, ref) => {
    const { t } = useTranslation(["tour"]);
    const location = useLocation();
    const navigate = useNavigate();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const [completionState, setCompletionState] =
      useState<TourCompletionState>("pending");
    const [hasLoadedPreference, setHasLoadedPreference] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [layout, setLayout] = useState<LayoutState | null>(null);
    const [pendingStart, setPendingStart] = useState<"auto" | "manual" | null>(
      null
    );
    const autoStartTriggeredRef = useRef(false);
    const prefersReducedMotion = usePrefersReducedMotion();
    const currentStep = TOUR_STEPS[currentStepIndex];
    const totalSteps = TOUR_STEPS.length;
    const motionDuration = prefersReducedMotion ? 1 : 440;

    const persistCompletionState = useCallback(
      (nextState: Exclude<TourCompletionState, "pending">) => {
        if (!userId) return;

        const storageKey = getWorkspaceTourStorageKey(userId);
        const persistedState =
          completionState === "completed" && nextState === "skipped"
            ? "completed"
            : nextState;

        window.localStorage.setItem(storageKey, persistedState);
        setCompletionState(persistedState);
      },
      [completionState, userId]
    );

    const closeTour = useCallback(
      (nextState?: Exclude<TourCompletionState, "pending">) => {
        if (nextState) persistCompletionState(nextState);
        setIsOpen(false);
        setLayout(null);
        setPendingStart(null);
      },
      [persistCompletionState]
    );

    const syncLayout = useCallback(() => {
      if (!isOpen) return;

      const target = findTourTarget(currentStep.targetId);
      if (!target) return;

      const targetRect = toRectState(
        target.getBoundingClientRect(),
        SPOTLIGHT_PADDING
      );
      const panelWidth = getPanelWidth();
      const measuredPanelRect = panelRef.current?.getBoundingClientRect();
      const panelHeight =
        measuredPanelRect?.height ??
        (window.innerWidth < MOBILE_BREAKPOINT ? 308 : 284);

      const nextPanelPosition =
        window.innerWidth < MOBILE_BREAKPOINT
          ? {
              x: VIEWPORT_MARGIN,
              y: Math.max(
                VIEWPORT_MARGIN,
                window.innerHeight - panelHeight - VIEWPORT_MARGIN
              )
            }
          : computeDesktopLayout(
              targetRect,
              panelWidth,
              panelHeight,
              currentStep.placement
            );

      const nextLayout: LayoutState = {
        panelHeight,
        panelWidth,
        targetRect,
        x: nextPanelPosition.x,
        y: nextPanelPosition.y
      };

      setLayout((currentLayout) =>
        layoutsMatch(currentLayout, nextLayout) ? currentLayout : nextLayout
      );
    }, [currentStep.placement, currentStep.targetId, isOpen]);

    const scheduleLayoutSync = useCallback(() => {
      if (!isOpen || frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        syncLayout();
      });
    }, [isOpen, syncLayout]);

    const startTour = useCallback(() => {
      if (!userId) return;

      autoStartTriggeredRef.current = true;
      setCurrentStepIndex(0);
      setLayout(null);
      setPendingStart("manual");

      if (location.pathname !== TOUR_ROUTE) navigate(TOUR_ROUTE);
    }, [location.pathname, navigate, userId]);

    useImperativeHandle(
      ref,
      () => ({
        start: startTour
      }),
      [startTour]
    );

    useEffect(() => {
      onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
      if (!userId) {
        setCompletionState("pending");
        setHasLoadedPreference(false);
        autoStartTriggeredRef.current = false;
        return;
      }

      const storedValue = window.localStorage.getItem(
        getWorkspaceTourStorageKey(userId)
      );
      const nextState: TourCompletionState =
        storedValue === "completed" || storedValue === "skipped"
          ? storedValue
          : "pending";

      setCompletionState(nextState);
      setHasLoadedPreference(true);
      autoStartTriggeredRef.current = false;
    }, [userId]);

    useEffect(() => {
      if (
        !userId ||
        !hasLoadedPreference ||
        completionState !== "pending" ||
        location.pathname !== TOUR_ROUTE ||
        isOpen ||
        pendingStart !== null ||
        autoStartTriggeredRef.current
      )
        return;

      autoStartTriggeredRef.current = true;
      setPendingStart("auto");
    }, [
      completionState,
      hasLoadedPreference,
      isOpen,
      location.pathname,
      pendingStart,
      userId
    ]);

    useEffect(() => {
      if (!pendingStart || location.pathname !== TOUR_ROUTE) return;

      setCurrentStepIndex(0);
      setLayout(null);
      setIsOpen(true);
      setPendingStart(null);
    }, [location.pathname, pendingStart]);

    useEffect(() => {
      if (!isOpen || location.pathname !== TOUR_ROUTE) return;

      let cancelled = false;

      const prepareStep = async () => {
        const target = await waitForTarget(currentStep.targetId);
        if (cancelled || !target) return;

        ensureTargetInView(target, prefersReducedMotion);
        scheduleLayoutSync();
      };

      void prepareStep();

      return () => {
        cancelled = true;
      };
    }, [
      currentStep.targetId,
      isOpen,
      location.pathname,
      prefersReducedMotion,
      scheduleLayoutSync
    ]);

    useLayoutEffect(() => {
      if (!isOpen) return;
      scheduleLayoutSync();
    }, [currentStepIndex, isOpen, scheduleLayoutSync]);

    useEffect(() => {
      if (!isOpen) return;

      const currentTarget = findTourTarget(currentStep.targetId);
      const resizeObserver = new ResizeObserver(() => scheduleLayoutSync());

      if (currentTarget) resizeObserver.observe(currentTarget);
      if (panelRef.current) resizeObserver.observe(panelRef.current);

      window.addEventListener("resize", scheduleLayoutSync, { passive: true });
      window.addEventListener("scroll", scheduleLayoutSync, {
        capture: true,
        passive: true
      });

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener("resize", scheduleLayoutSync);
        window.removeEventListener("scroll", scheduleLayoutSync, true);
      };
    }, [currentStep.targetId, isOpen, scheduleLayoutSync]);

    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeTour("skipped");
          return;
        }

        if (event.key === "ArrowRight" && currentStepIndex < totalSteps - 1) {
          event.preventDefault();
          setCurrentStepIndex((index) => index + 1);
          return;
        }

        if (event.key === "ArrowLeft" && currentStepIndex > 0) {
          event.preventDefault();
          setCurrentStepIndex((index) => index - 1);
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeTour, currentStepIndex, isOpen, totalSteps]);

    useEffect(() => {
      if (!isOpen) return;
      panelRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen || location.pathname === TOUR_ROUTE) return;
      setIsOpen(false);
      setLayout(null);
    }, [isOpen, location.pathname]);

    useEffect(() => {
      return () => {
        if (frameRef.current !== null)
          window.cancelAnimationFrame(frameRef.current);
      };
    }, []);

    const stepTitle = t(`steps.${currentStep.id}.title`);
    const stepDescription = t(`steps.${currentStep.id}.description`);
    const progressWidth = `${((currentStepIndex + 1) / totalSteps) * 100}%`;
    const overlaySegments = useMemo(() => {
      if (!layout) return [];

      const { targetRect } = layout;

      return [
        {
          height: `${targetRect.top}px`,
          left: 0,
          top: 0,
          width: "100%"
        },
        {
          height: `${targetRect.height}px`,
          left: 0,
          top: `${targetRect.top}px`,
          width: `${targetRect.left}px`
        },
        {
          height: `${targetRect.height}px`,
          left: `${targetRect.right}px`,
          top: `${targetRect.top}px`,
          width: `${window.innerWidth - targetRect.right}px`
        },
        {
          height: `${window.innerHeight - targetRect.bottom}px`,
          left: 0,
          top: `${targetRect.bottom}px`,
          width: "100%"
        }
      ];
    }, [layout]);

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
      <div className="pointer-events-none fixed inset-0 z-[120]">
        {overlaySegments.map((segment, index) => (
          <button
            type="button"
            key={index}
            aria-label={t("actions.skip")}
            className="pointer-events-auto fixed border-0 bg-[hsl(var(--charcoal)/0.36)] backdrop-blur-[8px]"
            style={{
              height: segment.height,
              left: segment.left,
              top: segment.top,
              transition: `all ${motionDuration}ms ${MOTION_EASING}`,
              width: segment.width
            }}
            onClick={() => closeTour("skipped")}
          />
        ))}

        {layout ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed rounded-[1.75rem] border border-primary/55 bg-white/5 shadow-[0_0_0_1px_hsl(var(--background)/0.35),0_0_0_9999px_transparent,0_24px_60px_-36px_hsl(var(--primary)/0.45)]"
            style={{
              height: layout.targetRect.height,
              left: layout.targetRect.left,
              top: layout.targetRect.top,
              transition: `all ${motionDuration}ms ${MOTION_EASING}`,
              width: layout.targetRect.width
            }}
          >
            <div className="absolute inset-0 rounded-[inherit] border border-white/45" />
          </div>
        ) : null}

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-tour-title"
          aria-describedby="workspace-tour-description"
          tabIndex={-1}
          className={cn(
            "pointer-events-auto fixed overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 text-left shadow-[0_26px_80px_-32px_rgba(15,23,42,0.48)] backdrop-blur-xl focus:outline-none dark:bg-card/95",
            layout === null && "opacity-0"
          )}
          style={{
            transform: `translate3d(${layout?.x ?? VIEWPORT_MARGIN}px, ${layout?.y ?? VIEWPORT_MARGIN}px, 0)`,
            transition: `transform ${motionDuration}ms ${MOTION_EASING}, opacity ${motionDuration}ms ${MOTION_EASING}, width ${motionDuration}ms ${MOTION_EASING}`,
            width: layout?.panelWidth ?? getPanelWidth()
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/[0.12] via-primary/[0.05] to-transparent" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] uppercase text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("badge")}
                </span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">
                    <span>
                      {t("step", {
                        current: currentStepIndex + 1,
                        total: totalSteps
                      })}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/65">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        transition: `width ${motionDuration}ms ${MOTION_EASING}`,
                        width: progressWidth
                      }}
                    />
                  </div>
                </div>
              </div>

              <CustomButton
                type="button"
                aria-label={t("actions.close")}
                size="iconSm"
                radius="full"
                styleType="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => closeTour("skipped")}
              >
                <X className="h-4 w-4" />
              </CustomButton>
            </div>

            <div className="mt-5 space-y-2">
              <h2
                id="workspace-tour-title"
                className="text-xl font-serif leading-tight text-foreground"
                aria-live="polite"
              >
                {stepTitle}
              </h2>
              <p
                id="workspace-tour-description"
                className="text-sm leading-6 text-muted-foreground"
              >
                {stepDescription}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {TOUR_STEPS.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  aria-label={t("step", {
                    current: index + 1,
                    total: totalSteps
                  })}
                  className={cn(
                    "h-2.5 rounded-full transition-all duration-300",
                    index === currentStepIndex
                      ? "w-7 bg-primary"
                      : "w-2.5 bg-border"
                  )}
                  onClick={() => setCurrentStepIndex(index)}
                />
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <CustomButton
                type="button"
                size="sm"
                radius="full"
                styleType="ghost"
                onClick={() => closeTour("skipped")}
              >
                {t("actions.skip")}
              </CustomButton>

              <div className="flex items-center gap-2">
                <CustomButton
                  type="button"
                  size="sm"
                  radius="full"
                  styleType="menu"
                  disabled={currentStepIndex === 0}
                  onClick={() =>
                    setCurrentStepIndex((index) => Math.max(index - 1, 0))
                  }
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("actions.back")}
                </CustomButton>

                {currentStepIndex === totalSteps - 1 ? (
                  <CustomButton
                    type="button"
                    size="sm"
                    radius="full"
                    styleType="primary"
                    onClick={() => closeTour("completed")}
                  >
                    <Check className="h-4 w-4" />
                    {t("actions.finish")}
                  </CustomButton>
                ) : (
                  <CustomButton
                    type="button"
                    size="sm"
                    radius="full"
                    styleType="primary"
                    onClick={() =>
                      setCurrentStepIndex((index) =>
                        Math.min(index + 1, totalSteps - 1)
                      )
                    }
                  >
                    {t("actions.next")}
                    <ArrowRight className="h-4 w-4" />
                  </CustomButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }
);

WorkspaceTour.displayName = "WorkspaceTour";

export default WorkspaceTour;
