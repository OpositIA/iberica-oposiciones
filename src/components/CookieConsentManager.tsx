import CustomButton from "@/components/ui/custom-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  acceptAllCookieCategories,
  COOKIE_CONSENT_STORAGE_KEY,
  createCookieConsentRecord,
  readCookieConsent,
  rejectOptionalCookieCategories,
  writeCookieConsent,
  type CookieConsentCategories,
  type CookieConsentDecision
} from "@/lib/cookieConsent";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stars
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type CookieConsentManagerProps = {
  cookiePolicyHref?: string | null;
  openPreferencesRequest?: number;
};

const CookieConsentManager = ({
  cookiePolicyHref = null,
  openPreferencesRequest = 0
}: CookieConsentManagerProps) => {
  const { t } = useTranslation("landing");
  const [storedConsent, setStoredConsent] = useState(() => readCookieConsent());
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const handledOpenPreferencesRequestRef = useRef(0);
  const [draftCategories, setDraftCategories] =
    useState<CookieConsentCategories>(
      () => storedConsent?.categories ?? rejectOptionalCookieCategories()
    );

  const resetDraft = useCallback(
    (consent = storedConsent) => {
      setDraftCategories(
        consent?.categories ?? rejectOptionalCookieCategories()
      );
    },
    [storedConsent]
  );

  useEffect(() => {
    if (openPreferencesRequest <= 0) return;
    if (handledOpenPreferencesRequestRef.current === openPreferencesRequest)
      return;

    handledOpenPreferencesRequestRef.current = openPreferencesRequest;
    resetDraft();
    setIsPreferencesOpen(true);
  }, [openPreferencesRequest, resetDraft]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== COOKIE_CONSENT_STORAGE_KEY) return;
      setStoredConsent(readCookieConsent());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistConsent = useCallback(
    (decision: CookieConsentDecision, categories: CookieConsentCategories) => {
      const nextConsent = createCookieConsentRecord({ decision, categories });
      writeCookieConsent(nextConsent);
      setStoredConsent(nextConsent);
      setDraftCategories(nextConsent.categories);
      setIsPreferencesOpen(false);
    },
    []
  );

  const handleAcceptAll = useCallback(() => {
    persistConsent("accept_all", acceptAllCookieCategories());
  }, [persistConsent]);

  const handleRejectAll = useCallback(() => {
    persistConsent("reject_all", rejectOptionalCookieCategories());
  }, [persistConsent]);

  const handleSavePreferences = useCallback(() => {
    persistConsent("custom", draftCategories);
  }, [draftCategories, persistConsent]);

  const handleOptionalCategoryChange = useCallback(
    (category: "preferences" | "analytics" | "marketing", checked: boolean) => {
      setDraftCategories((current) => ({
        ...current,
        [category]: checked
      }));
    },
    []
  );

  const categories = useMemo(
    () => [
      {
        id: "necessary" as const,
        icon: ShieldCheck,
        title: t("cookieConsent.categories.necessary.title"),
        description: t("cookieConsent.categories.necessary.description"),
        checked: true,
        disabled: true,
        toneClassName:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        badge: t("cookieConsent.preferences.status.alwaysActive")
      },
      {
        id: "preferences" as const,
        icon: Sparkles,
        title: t("cookieConsent.categories.preferences.title"),
        description: t("cookieConsent.categories.preferences.description"),
        checked: draftCategories.preferences,
        disabled: false,
        toneClassName: "border-primary/20 bg-primary/10 text-primary",
        badge: draftCategories.preferences
          ? t("cookieConsent.preferences.status.active")
          : t("cookieConsent.preferences.status.optional")
      },
      {
        id: "analytics" as const,
        icon: BarChart3,
        title: t("cookieConsent.categories.analytics.title"),
        description: t("cookieConsent.categories.analytics.description"),
        checked: draftCategories.analytics,
        disabled: false,
        toneClassName: "border-sky-500/20 bg-sky-500/10 text-sky-700",
        badge: draftCategories.analytics
          ? t("cookieConsent.preferences.status.active")
          : t("cookieConsent.preferences.status.optional")
      },
      {
        id: "marketing" as const,
        icon: Stars,
        title: t("cookieConsent.categories.marketing.title"),
        description: t("cookieConsent.categories.marketing.description"),
        checked: draftCategories.marketing,
        disabled: false,
        toneClassName:
          "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700",
        badge: draftCategories.marketing
          ? t("cookieConsent.preferences.status.active")
          : t("cookieConsent.preferences.status.optional")
      }
    ],
    [
      draftCategories.analytics,
      draftCategories.marketing,
      draftCategories.preferences,
      t
    ]
  );

  return (
    <>
      {!storedConsent && !isPreferencesOpen ? (
        <section className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pt-8 sm:px-6">
          <div className="pointer-events-auto mx-auto max-w-5xl rounded-[1.5rem] border border-border bg-card shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("cookieConsent.banner.eyebrow")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                    {t("cookieConsent.preferences.status.alwaysActive")}
                  </span>
                </div>

                <div className="mt-3 max-w-2xl">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {t("cookieConsent.banner.title")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("cookieConsent.banner.description")}
                    {cookiePolicyHref ? (
                      <>
                        {" "}
                        <Link
                          to={cookiePolicyHref}
                          className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary"
                        >
                          {t("cookieConsent.banner.policyLink")}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:justify-end">
                <CustomButton
                  styleType="primary"
                  radius="full"
                  className="h-10 justify-center"
                  onClick={handleAcceptAll}
                >
                  {t("cookieConsent.actions.acceptAll")}
                </CustomButton>
                <CustomButton
                  styleType="ghost"
                  radius="full"
                  className="h-10 justify-center border-border bg-card text-foreground hover:bg-secondary"
                  onClick={handleRejectAll}
                >
                  {t("cookieConsent.actions.rejectAll")}
                </CustomButton>
                <CustomButton
                  styleType="subtle"
                  radius="full"
                  className="h-10 justify-center"
                  onClick={() => {
                    resetDraft();
                    setIsPreferencesOpen(true);
                  }}
                >
                  <Settings2 className="h-4 w-4" />
                  {t("cookieConsent.actions.configure")}
                </CustomButton>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Dialog
        open={isPreferencesOpen}
        onOpenChange={(open) => {
          if (open) resetDraft();
          setIsPreferencesOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[1.75rem] border-border bg-background p-0 shadow-[0_36px_100px_-52px_rgba(15,23,42,0.42)] sm:p-0">
          <div className="px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-9">
            <DialogHeader className="max-w-2xl">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
                <Settings2 className="h-3.5 w-3.5" />
                {t("cookieConsent.preferences.eyebrow")}
              </span>
              <DialogTitle className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                {t("cookieConsent.preferences.title")}
              </DialogTitle>
              <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {t("cookieConsent.preferences.description")}
                {cookiePolicyHref ? (
                  <>
                    {" "}
                    <Link
                      to={cookiePolicyHref}
                      className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary"
                    >
                      {t("cookieConsent.banner.policyLink")}
                    </Link>
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-8 grid gap-4">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <section
                    key={category.id}
                    className="rounded-[1.35rem] border border-border bg-card p-5"
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border",
                          category.toneClassName
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-foreground">
                                {category.title}
                              </h3>
                              <span className="inline-flex rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                                {category.badge}
                              </span>
                            </div>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                              {category.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 sm:ml-6">
                            <span className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                              {category.checked
                                ? t("cookieConsent.preferences.status.active")
                                : t("cookieConsent.preferences.status.off")}
                            </span>
                            <Switch
                              checked={category.checked}
                              disabled={category.disabled}
                              aria-label={category.title}
                              onCheckedChange={(checked) => {
                                if (
                                  category.disabled ||
                                  category.id === "necessary"
                                )
                                  return;
                                handleOptionalCategoryChange(
                                  category.id,
                                  checked
                                );
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="mt-6 rounded-[1.2rem] border border-border bg-secondary px-4 py-4">
              <p className="text-sm leading-6 text-muted-foreground">
                {t("cookieConsent.preferences.updatedHint")}
              </p>
            </div>

            <DialogFooter className="mt-8 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
              <div className="flex flex-col gap-3 sm:flex-row">
                <CustomButton
                  styleType="ghost"
                  radius="full"
                  className="h-11 justify-center border-border bg-background/80 text-foreground hover:bg-background"
                  onClick={handleRejectAll}
                >
                  {t("cookieConsent.actions.rejectAll")}
                </CustomButton>
                <CustomButton
                  styleType="subtle"
                  radius="full"
                  className="h-11 justify-center"
                  onClick={handleAcceptAll}
                >
                  {t("cookieConsent.actions.acceptAll")}
                </CustomButton>
              </div>

              <CustomButton
                styleType="primary"
                radius="full"
                className="h-11 justify-center"
                onClick={handleSavePreferences}
              >
                {t("cookieConsent.actions.saveSelection")}
              </CustomButton>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentManager;
