import { useAuth } from "@/auth/AuthProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import CustomSelect from "@/components/ui/custom-select";
import CustomTextarea from "@/components/ui/custom-textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  submitSupportContactForm,
  submitSupportQuestionReport,
  supportChannelAvailability
} from "@/support/supportApi";
import {
  emptySupportContactForm,
  emptySupportQuestionReportForm,
  isValidEmailAddress,
  sanitizeSupportContactForm,
  sanitizeSupportQuestionReportForm,
  type SupportContactFormValues,
  type SupportQuestionReportFormValues
} from "@/support/supportForms";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  CircleAlert,
  CreditCard,
  FileWarning,
  HelpCircle,
  LifeBuoy,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TestTubeDiagonal
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

type SupportSectionId =
  | "help-center"
  | "faq"
  | "contact"
  | "report"
  | "about-ai";

type SupportNavItem = {
  description: string;
  id: SupportSectionId;
  label: string;
};

type HelpQuickLink = {
  cta: string;
  description: string;
  faqCategory?: string;
  id: string;
  section: SupportSectionId;
  title: string;
};

type HelpCoverageItem = {
  description: string;
  icon: "billing" | "faq" | "ia" | "tests";
  title: string;
};

type HelpStep = {
  description: string;
  title: string;
};

type FaqEntry = {
  answer: string;
  id: string;
  question: string;
};

type FaqGroup = {
  description: string;
  id: string;
  items: FaqEntry[];
  label: string;
};

type SupportOption = {
  label: string;
  value: string;
};

type AboutAiCard = {
  description: string;
  icon: "assist" | "contrast" | "report";
  title: string;
};

const DEFAULT_SECTION: SupportSectionId = "help-center";
const SECTION_PARAM = "section";
const FAQ_PARAM = "faq";
const VALID_SECTIONS = new Set<SupportSectionId>([
  "help-center",
  "faq",
  "contact",
  "report",
  "about-ai"
]);

const pagePanelClassName =
  "rounded-[1.75rem] border border-border/70 bg-background/95 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_56px_-46px_rgba(0,0,0,0.54)]";
const insetPanelClassName =
  "rounded-[1.45rem] border border-border/70 bg-secondary/20";
const fieldClassName =
  "min-h-12 rounded-2xl border-border/70 bg-background/80 px-4 shadow-sm transition-all duration-200 focus-visible:ring-primary/25 focus-visible:ring-offset-2";

const normalizeSection = (value: string | null): SupportSectionId => {
  if (!value) return DEFAULT_SECTION;
  return VALID_SECTIONS.has(value as SupportSectionId)
    ? (value as SupportSectionId)
    : DEFAULT_SECTION;
};

const buildSupportMetadata = (
  userId: string | null,
  locale: string,
  pathname: string
) => ({
  locale,
  pathname,
  submittedAt: new Date().toISOString(),
  userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
  userId
});

const InfoBadge = ({ label }: { label: string }) => (
  <span className="inline-flex w-fit items-center rounded-full border border-border/70 bg-secondary/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
    {label}
  </span>
);

const SectionHeading = ({
  description,
  title
}: {
  description: string;
  title: string;
}) => (
  <div className="space-y-2">
    <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-[2rem]">
      {title}
    </h2>
    <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
      {description}
    </p>
  </div>
);

const FieldShell = ({
  children,
  error,
  helper,
  htmlFor,
  label,
  meta
}: {
  children: React.ReactNode;
  error?: string;
  helper?: string;
  htmlFor: string;
  label: string;
  meta?: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      {meta ? (
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </div>
    {helper ? (
      <p
        id={`${htmlFor}-description`}
        className="text-sm text-muted-foreground"
      >
        {helper}
      </p>
    ) : null}
    {children}
    {error ? (
      <p
        id={`${htmlFor}-error`}
        className="text-sm font-medium text-destructive"
      >
        {error}
      </p>
    ) : null}
  </div>
);

const iconMap: Record<string, LucideIcon> = {
  "about-ai": Bot,
  billing: CreditCard,
  contact: MessageSquareText,
  faq: HelpCircle,
  "help-center": LifeBuoy,
  ia: Sparkles,
  report: FileWarning,
  tests: TestTubeDiagonal
};

const aboutAiIconMap: Record<AboutAiCard["icon"], LucideIcon> = {
  assist: Sparkles,
  contrast: ShieldCheck,
  report: FileWarning
};

const Support = () => {
  const { t, i18n } = useTranslation(["support"]);
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const navigationItems = useMemo(
    () =>
      t("support:navigation.sections", {
        returnObjects: true
      }) as SupportNavItem[],
    [t]
  );
  const quickLinks = useMemo(
    () =>
      t("support:helpCenter.quickLinks.items", {
        returnObjects: true
      }) as HelpQuickLink[],
    [t]
  );
  const helpCoverage = useMemo(
    () =>
      t("support:helpCenter.coverage.items", {
        returnObjects: true
      }) as HelpCoverageItem[],
    [t]
  );
  const helpSteps = useMemo(
    () =>
      t("support:helpCenter.steps.items", {
        returnObjects: true
      }) as HelpStep[],
    [t]
  );
  const faqGroups = useMemo(
    () =>
      t("support:faq.groups", {
        returnObjects: true
      }) as FaqGroup[],
    [t]
  );
  const contactCategories = useMemo(
    () =>
      t("support:contact.form.options.categories", {
        returnObjects: true
      }) as SupportOption[],
    [t]
  );
  const contactIssueTypes = useMemo(
    () =>
      t("support:contact.form.options.issueTypes", {
        returnObjects: true
      }) as SupportOption[],
    [t]
  );
  const reportProblemTypes = useMemo(
    () =>
      t("support:report.form.options.problemTypes", {
        returnObjects: true
      }) as SupportOption[],
    [t]
  );
  const reportContextTypes = useMemo(
    () =>
      t("support:report.form.options.contextTypes", {
        returnObjects: true
      }) as SupportOption[],
    [t]
  );
  const contactGuidance = useMemo(
    () =>
      t("support:contact.guidance.items", {
        returnObjects: true
      }) as string[],
    [t]
  );
  const reportGuidance = useMemo(
    () =>
      t("support:report.guidance.items", {
        returnObjects: true
      }) as string[],
    [t]
  );
  const aboutAiCards = useMemo(
    () =>
      t("support:aboutAi.cards", {
        returnObjects: true
      }) as AboutAiCard[],
    [t]
  );

  const faqCategoryIds = useMemo(
    () => new Set(faqGroups.map((group) => group.id)),
    [faqGroups]
  );
  const activeSection = normalizeSection(searchParams.get(SECTION_PARAM));
  const activeFaqCategory = useMemo(() => {
    const value = searchParams.get(FAQ_PARAM);
    if (!value || !faqCategoryIds.has(value)) return "all";
    return value;
  }, [faqCategoryIds, searchParams]);
  const visibleFaqGroups = useMemo(() => {
    if (activeFaqCategory === "all") return faqGroups;
    return faqGroups.filter((group) => group.id === activeFaqCategory);
  }, [activeFaqCategory, faqGroups]);

  const profileName = useMemo(() => {
    const fullName =
      `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
    return fullName;
  }, [profile?.firstName, profile?.lastName]);
  const profileEmail = profile?.email ?? user?.email ?? "";

  const contactForm = useForm<SupportContactFormValues>({
    defaultValues: {
      ...emptySupportContactForm,
      email: profileEmail,
      name: profileName
    },
    mode: "onBlur"
  });
  const reportForm = useForm<SupportQuestionReportFormValues>({
    defaultValues: emptySupportQuestionReportForm,
    mode: "onBlur"
  });

  useEffect(() => {
    if (!profileName) return;
    const currentName = contactForm.getValues("name");
    if (currentName.trim().length > 0) return;
    contactForm.setValue("name", profileName, { shouldDirty: false });
  }, [contactForm, profileName]);

  useEffect(() => {
    if (!profileEmail) return;
    const currentEmail = contactForm.getValues("email");
    if (currentEmail.trim().length > 0) return;
    contactForm.setValue("email", profileEmail, { shouldDirty: false });
  }, [contactForm, profileEmail]);

  const setSupportLocation = useCallback(
    (section: SupportSectionId, faqCategory?: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set(SECTION_PARAM, section);

      if (faqCategory) nextParams.set(FAQ_PARAM, faqCategory);
      else if (section !== "faq") nextParams.delete(FAQ_PARAM);

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const contactFormErrors = contactForm.formState.errors;
  const reportFormErrors = reportForm.formState.errors;

  const handleContactSubmit = contactForm.handleSubmit(async (rawValues) => {
    const sanitized = sanitizeSupportContactForm(rawValues);

    try {
      const result = await submitSupportContactForm({
        ...sanitized,
        metadata: buildSupportMetadata(
          user?.id ?? null,
          i18n.resolvedLanguage ?? "es",
          window.location.pathname
        )
      });

      if (result.status === "unconfigured") {
        toast({
          title: t("support:contact.toasts.unconfiguredTitle"),
          description: t("support:contact.toasts.unconfiguredDescription")
        });
        return;
      }

      contactForm.reset({
        ...emptySupportContactForm,
        email: sanitized.email,
        name: sanitized.name
      });
      toast({
        title: t("support:contact.toasts.successTitle"),
        description: t("support:contact.toasts.successDescription")
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("support:contact.toasts.errorTitle"),
        description: t("support:contact.toasts.errorDescription")
      });
    }
  });

  const handleReportSubmit = reportForm.handleSubmit(async (rawValues) => {
    const sanitized = sanitizeSupportQuestionReportForm(rawValues);

    try {
      const result = await submitSupportQuestionReport({
        ...sanitized,
        metadata: {
          ...buildSupportMetadata(
            user?.id ?? null,
            i18n.resolvedLanguage ?? "es",
            window.location.pathname
          ),
          reporterEmail: profileEmail || null,
          reporterName: profileName || null
        }
      });

      if (result.status === "unconfigured") {
        toast({
          title: t("support:report.toasts.unconfiguredTitle"),
          description: t("support:report.toasts.unconfiguredDescription")
        });
        return;
      }

      reportForm.reset(emptySupportQuestionReportForm);
      toast({
        title: t("support:report.toasts.successTitle"),
        description: t("support:report.toasts.successDescription")
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("support:report.toasts.errorTitle"),
        description: t("support:report.toasts.errorDescription")
      });
    }
  });

  return (
    <div className="space-y-6 pb-2">
      <section className={`${pagePanelClassName} overflow-hidden p-6 md:p-8`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
          <div className="space-y-4">
            <InfoBadge label={t("support:page.badge")} />
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-[3.4rem] md:leading-[1.02]">
                {t("support:page.title")}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                {t("support:page.description")}
              </p>
            </div>
          </div>

          <div className={`${insetPanelClassName} p-4 md:p-5`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.slice(0, 4).map((item) => {
                const Icon = iconMap[item.section] ?? LifeBuoy;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setSupportLocation(item.section, item.faqCategory)
                    }
                    className="group rounded-[1.25rem] border border-border/70 bg-background/85 p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_36px_-30px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-secondary/40 text-foreground transition-transform duration-200 group-hover:scale-[1.03]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Tabs
        value={activeSection}
        onValueChange={(value) =>
          setSupportLocation(normalizeSection(value), activeFaqCategory)
        }
        className="space-y-4"
      >
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-[1.5rem] border border-border/70 bg-background/90 p-2 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
          {navigationItems.map((item) => {
            const Icon = iconMap[item.id] ?? LifeBuoy;

            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="min-w-[11rem] flex-1 rounded-[1rem] border border-transparent px-4 py-3 data-[state=active]:border-border/70 data-[state=active]:shadow-none"
              >
                <span className="flex items-start gap-3 text-left">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-secondary/35">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="help-center" className="space-y-6">
          <section className={`${pagePanelClassName} p-6 md:p-8`}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
              <div className="space-y-6">
                <SectionHeading
                  title={t("support:helpCenter.title")}
                  description={t("support:helpCenter.description")}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  {quickLinks.map((item) => {
                    const Icon = iconMap[item.section] ?? LifeBuoy;

                    return (
                      <article
                        key={item.id}
                        className={`${insetPanelClassName} group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_36px_-30px_rgba(15,23,42,0.35)]`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/90">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">
                                {item.title}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                        <CustomButton
                          type="button"
                          styleType="ghost"
                          radius="xl"
                          className="mt-5 justify-start"
                          onClick={() =>
                            setSupportLocation(item.section, item.faqCategory)
                          }
                        >
                          {item.cta}
                        </CustomButton>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className={`${insetPanelClassName} p-5`}>
                  <p className="text-sm font-semibold text-foreground">
                    {t("support:helpCenter.coverage.title")}
                  </p>
                  <div className="mt-4 space-y-3">
                    {helpCoverage.map((item) => {
                      const Icon = iconMap[item.icon] ?? LifeBuoy;

                      return (
                        <div
                          key={item.title}
                          className="rounded-[1.1rem] border border-border/70 bg-background/85 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-secondary/40">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`${insetPanelClassName} p-5`}>
                  <p className="text-sm font-semibold text-foreground">
                    {t("support:helpCenter.steps.title")}
                  </p>
                  <div className="mt-4 space-y-3">
                    {helpSteps.map((item, index) => (
                      <div
                        key={item.title}
                        className="flex items-start gap-3 rounded-[1.1rem] border border-border/70 bg-background/85 p-4"
                      >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-secondary/45 text-xs font-semibold text-foreground">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="faq" className="space-y-6">
          <section className={`${pagePanelClassName} p-6 md:p-8`}>
            <div className="space-y-6">
              <SectionHeading
                title={t("support:faq.title")}
                description={t("support:faq.description")}
              />

              <div className="flex flex-wrap gap-2">
                <CustomButton
                  type="button"
                  size="sm"
                  radius="full"
                  styleType={activeFaqCategory === "all" ? "primary" : "ghost"}
                  onClick={() => setSupportLocation("faq")}
                >
                  {t("support:faq.allCategories")}
                </CustomButton>
                {faqGroups.map((group) => (
                  <CustomButton
                    key={group.id}
                    type="button"
                    size="sm"
                    radius="full"
                    styleType={
                      activeFaqCategory === group.id ? "primary" : "ghost"
                    }
                    onClick={() => setSupportLocation("faq", group.id)}
                  >
                    {group.label}
                  </CustomButton>
                ))}
              </div>

              <div className="space-y-4">
                {visibleFaqGroups.map((group) => (
                  <section
                    key={group.id}
                    className={`${insetPanelClassName} overflow-hidden p-5 md:p-6`}
                  >
                    <div className="mb-4 space-y-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {group.label}
                      </h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {group.description}
                      </p>
                    </div>

                    <Accordion
                      type="multiple"
                      className="rounded-2xl border border-border/70 bg-background/90 px-4 md:px-5"
                    >
                      {group.items.map((item) => (
                        <AccordionItem
                          key={item.id}
                          value={`${group.id}-${item.id}`}
                          className="border-border/70"
                        >
                          <AccordionTrigger className="gap-4 py-5 text-left text-sm font-semibold text-foreground hover:no-underline">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="pb-5 text-sm leading-7 text-muted-foreground">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </section>
                ))}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="contact" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
            <article className={`${pagePanelClassName} p-6 md:p-8`}>
              <form
                className="space-y-6"
                onSubmit={handleContactSubmit}
                noValidate
              >
                <SectionHeading
                  title={t("support:contact.title")}
                  description={t("support:contact.description")}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    htmlFor="support-contact-name"
                    label={t("support:contact.form.fields.name.label")}
                    meta={t("support:contact.form.required")}
                    error={contactFormErrors.name?.message}
                  >
                    <CustomInput
                      id="support-contact-name"
                      autoComplete="name"
                      placeholder={t(
                        "support:contact.form.fields.name.placeholder"
                      )}
                      className={fieldClassName}
                      aria-describedby="support-contact-name-description support-contact-name-error"
                      aria-invalid={Boolean(contactFormErrors.name)}
                      {...contactForm.register("name", {
                        required: t("support:validation.required"),
                        validate: (value) => {
                          const sanitized = value.trim();
                          if (sanitized.length < 2)
                            return t("support:validation.nameMin");
                          return true;
                        }
                      })}
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="support-contact-email"
                    label={t("support:contact.form.fields.email.label")}
                    meta={t("support:contact.form.required")}
                    error={contactFormErrors.email?.message}
                  >
                    <CustomInput
                      id="support-contact-email"
                      type="email"
                      autoComplete="email"
                      placeholder={t(
                        "support:contact.form.fields.email.placeholder"
                      )}
                      className={fieldClassName}
                      aria-describedby="support-contact-email-description support-contact-email-error"
                      aria-invalid={Boolean(contactFormErrors.email)}
                      {...contactForm.register("email", {
                        required: t("support:validation.required"),
                        validate: (value) =>
                          isValidEmailAddress(value.trim()) ||
                          t("support:validation.email")
                      })}
                    />
                  </FieldShell>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    htmlFor="support-contact-category"
                    label={t("support:contact.form.fields.category.label")}
                    meta={t("support:contact.form.required")}
                    error={contactFormErrors.category?.message}
                  >
                    <Controller
                      control={contactForm.control}
                      name="category"
                      rules={{ required: t("support:validation.required") }}
                      render={({ field }) => (
                        <CustomSelect
                          id="support-contact-category"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className={fieldClassName}
                          placeholder={t(
                            "support:contact.form.fields.category.placeholder"
                          )}
                        >
                          {contactCategories.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </CustomSelect>
                      )}
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="support-contact-issue-type"
                    label={t("support:contact.form.fields.issueType.label")}
                    meta={t("support:contact.form.optional")}
                    error={contactFormErrors.issueType?.message}
                  >
                    <Controller
                      control={contactForm.control}
                      name="issueType"
                      render={({ field }) => (
                        <CustomSelect
                          id="support-contact-issue-type"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className={fieldClassName}
                          placeholder={t(
                            "support:contact.form.fields.issueType.placeholder"
                          )}
                        >
                          {contactIssueTypes.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </CustomSelect>
                      )}
                    />
                  </FieldShell>
                </div>

                <FieldShell
                  htmlFor="support-contact-context"
                  label={t("support:contact.form.fields.context.label")}
                  meta={t("support:contact.form.optional")}
                  helper={t("support:contact.form.fields.context.helper")}
                  error={contactFormErrors.context?.message}
                >
                  <CustomInput
                    id="support-contact-context"
                    placeholder={t(
                      "support:contact.form.fields.context.placeholder"
                    )}
                    className={fieldClassName}
                    aria-describedby="support-contact-context-description support-contact-context-error"
                    aria-invalid={Boolean(contactFormErrors.context)}
                    {...contactForm.register("context")}
                  />
                </FieldShell>

                <FieldShell
                  htmlFor="support-contact-message"
                  label={t("support:contact.form.fields.message.label")}
                  meta={t("support:contact.form.required")}
                  helper={t("support:contact.form.fields.message.helper")}
                  error={contactFormErrors.message?.message}
                >
                  <CustomTextarea
                    id="support-contact-message"
                    placeholder={t(
                      "support:contact.form.fields.message.placeholder"
                    )}
                    className={`${fieldClassName} min-h-[170px] py-3`}
                    aria-describedby="support-contact-message-description support-contact-message-error"
                    aria-invalid={Boolean(contactFormErrors.message)}
                    {...contactForm.register("message", {
                      required: t("support:validation.required"),
                      validate: (value) => {
                        const sanitized = value.trim();
                        if (sanitized.length < 20)
                          return t("support:validation.messageMin");
                        return true;
                      }
                    })}
                  />
                </FieldShell>

                <div className="flex flex-wrap items-center gap-3">
                  <CustomButton
                    type="submit"
                    styleType="primary"
                    radius="xl"
                    className="min-w-[12rem]"
                    disabled={contactForm.formState.isSubmitting}
                  >
                    {contactForm.formState.isSubmitting
                      ? t("support:contact.form.submitting")
                      : t("support:contact.form.submit")}
                  </CustomButton>
                  <p className="text-sm text-muted-foreground">
                    {t("support:contact.form.footnote")}
                  </p>
                </div>
              </form>
            </article>

            <aside className="space-y-6">
              <article className={`${pagePanelClassName} p-6`}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-secondary/35">
                    <CircleAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {supportChannelAvailability.contact
                        ? t("support:contact.delivery.configuredTitle")
                        : t("support:contact.delivery.unconfiguredTitle")}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {supportChannelAvailability.contact
                        ? t("support:contact.delivery.configuredDescription")
                        : t("support:contact.delivery.unconfiguredDescription")}
                    </p>
                  </div>
                </div>
              </article>

              <article className={`${pagePanelClassName} p-6`}>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("support:contact.guidance.title")}
                </h3>
                <div className="mt-4 space-y-3">
                  {contactGuidance.map((item, index) => (
                    <div
                      key={item}
                      className={`${insetPanelClassName} flex items-start gap-3 p-4`}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85 text-xs font-semibold">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </section>
        </TabsContent>

        <TabsContent value="report" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
            <article className={`${pagePanelClassName} p-6 md:p-8`}>
              <form
                className="space-y-6"
                onSubmit={handleReportSubmit}
                noValidate
              >
                <SectionHeading
                  title={t("support:report.title")}
                  description={t("support:report.description")}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldShell
                    htmlFor="support-report-reference"
                    label={t(
                      "support:report.form.fields.questionReference.label"
                    )}
                    meta={t("support:report.form.optional")}
                    helper={t(
                      "support:report.form.fields.questionReference.helper"
                    )}
                    error={reportFormErrors.questionReference?.message}
                  >
                    <CustomInput
                      id="support-report-reference"
                      placeholder={t(
                        "support:report.form.fields.questionReference.placeholder"
                      )}
                      className={fieldClassName}
                      {...reportForm.register("questionReference")}
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="support-report-problem-type"
                    label={t("support:report.form.fields.problemType.label")}
                    meta={t("support:report.form.required")}
                    error={reportFormErrors.problemType?.message}
                  >
                    <Controller
                      control={reportForm.control}
                      name="problemType"
                      rules={{ required: t("support:validation.required") }}
                      render={({ field }) => (
                        <CustomSelect
                          id="support-report-problem-type"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className={fieldClassName}
                          placeholder={t(
                            "support:report.form.fields.problemType.placeholder"
                          )}
                        >
                          {reportProblemTypes.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </CustomSelect>
                      )}
                    />
                  </FieldShell>
                </div>

                <FieldShell
                  htmlFor="support-report-context-type"
                  label={t("support:report.form.fields.contextType.label")}
                  meta={t("support:report.form.optional")}
                  error={reportFormErrors.contextType?.message}
                >
                  <Controller
                    control={reportForm.control}
                    name="contextType"
                    render={({ field }) => (
                      <CustomSelect
                        id="support-report-context-type"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        className={fieldClassName}
                        placeholder={t(
                          "support:report.form.fields.contextType.placeholder"
                        )}
                      >
                        {reportContextTypes.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </CustomSelect>
                    )}
                  />
                </FieldShell>

                <FieldShell
                  htmlFor="support-report-description"
                  label={t("support:report.form.fields.description.label")}
                  meta={t("support:report.form.required")}
                  helper={t("support:report.form.fields.description.helper")}
                  error={reportFormErrors.description?.message}
                >
                  <CustomTextarea
                    id="support-report-description"
                    placeholder={t(
                      "support:report.form.fields.description.placeholder"
                    )}
                    className={`${fieldClassName} min-h-[170px] py-3`}
                    {...reportForm.register("description", {
                      required: t("support:validation.required"),
                      validate: (value) => {
                        const sanitized = value.trim();
                        if (sanitized.length < 16)
                          return t("support:validation.reportDescriptionMin");
                        return true;
                      }
                    })}
                  />
                </FieldShell>

                <FieldShell
                  htmlFor="support-report-additional-context"
                  label={t(
                    "support:report.form.fields.additionalContext.label"
                  )}
                  meta={t("support:report.form.optional")}
                  helper={t(
                    "support:report.form.fields.additionalContext.helper"
                  )}
                  error={reportFormErrors.additionalContext?.message}
                >
                  <CustomTextarea
                    id="support-report-additional-context"
                    placeholder={t(
                      "support:report.form.fields.additionalContext.placeholder"
                    )}
                    className={`${fieldClassName} min-h-[130px] py-3`}
                    {...reportForm.register("additionalContext")}
                  />
                </FieldShell>

                <div className="flex flex-wrap items-center gap-3">
                  <CustomButton
                    type="submit"
                    styleType="primary"
                    radius="xl"
                    className="min-w-[12rem]"
                    disabled={reportForm.formState.isSubmitting}
                  >
                    {reportForm.formState.isSubmitting
                      ? t("support:report.form.submitting")
                      : t("support:report.form.submit")}
                  </CustomButton>
                  <p className="text-sm text-muted-foreground">
                    {t("support:report.form.footnote")}
                  </p>
                </div>
              </form>
            </article>

            <aside className="space-y-6">
              <article className={`${pagePanelClassName} p-6`}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-secondary/35">
                    <FileWarning className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {supportChannelAvailability.report
                        ? t("support:report.delivery.configuredTitle")
                        : t("support:report.delivery.unconfiguredTitle")}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {supportChannelAvailability.report
                        ? t("support:report.delivery.configuredDescription")
                        : t("support:report.delivery.unconfiguredDescription")}
                    </p>
                  </div>
                </div>
              </article>

              <article className={`${pagePanelClassName} p-6`}>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("support:report.guidance.title")}
                </h3>
                <div className="mt-4 space-y-3">
                  {reportGuidance.map((item, index) => (
                    <div
                      key={item}
                      className={`${insetPanelClassName} flex items-start gap-3 p-4`}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85 text-xs font-semibold">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </section>
        </TabsContent>

        <TabsContent value="about-ai" className="space-y-6">
          <section className={`${pagePanelClassName} p-6 md:p-8`}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
              <div className="space-y-6">
                <SectionHeading
                  title={t("support:aboutAi.title")}
                  description={t("support:aboutAi.description")}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  {aboutAiCards.map((item) => {
                    const Icon = aboutAiIconMap[item.icon];

                    return (
                      <article
                        key={item.title}
                        className={`${insetPanelClassName} p-5`}
                      >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/90">
                          <Icon className="h-4 w-4" />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold text-foreground">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className={`${insetPanelClassName} p-5 md:p-6`}>
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/90">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {t("support:aboutAi.note.title")}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {t("support:aboutAi.note.description")}
                    </p>
                    <CustomButton
                      type="button"
                      radius="xl"
                      className="mt-5"
                      onClick={() => setSupportLocation("report")}
                    >
                      {t("support:aboutAi.note.cta")}
                    </CustomButton>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Support;
