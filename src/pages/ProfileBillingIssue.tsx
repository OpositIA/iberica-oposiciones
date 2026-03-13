import { useAuth } from "@/auth/AuthProvider";
import AppLoading from "@/components/AppLoading";
import CustomButton from "@/components/ui/custom-button";
import { useToast } from "@/hooks/use-toast";
import {
  createCustomerPortalSession,
  useUserBillingIssueQuery
} from "@/queries/subscriptionQueries";
import { AlertTriangle, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const formatDateTime = (
  value: string | null,
  locale: string,
  fallback: string
) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const ProfileBillingIssue = () => {
  const { t, i18n } = useTranslation("plans");
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: billingIssue, isLoading } = useUserBillingIssueQuery(user?.id);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const intlLocale = useMemo(
    () => (i18n.resolvedLanguage?.toLowerCase().startsWith("en") ? "en-US" : "es-ES"),
    [i18n.resolvedLanguage]
  );

  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);

    try {
      const { portalUrl } = await createCustomerPortalSession({
        returnPath: "/perfil/pago-fallido"
      });

      toast({
        title: t("billingIssue.toasts.portalRedirectTitle"),
        description: t("billingIssue.toasts.portalRedirectDescription")
      });

      window.location.assign(portalUrl);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("billingIssue.toasts.portalRedirectErrorTitle"),
        description:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t("billingIssue.toasts.portalRedirectErrorDescription")
      });
    } finally {
      setIsOpeningPortal(false);
    }
  };

  if (isLoading) {
    return <AppLoading label={t("billingIssue.loading")} className="mx-auto max-w-4xl" />;
  }

  if (!billingIssue) {
    return (
      <section className="mx-auto max-w-4xl rounded-3xl border border-border/70 bg-background/95 p-6">
        <h1 className="text-2xl font-serif text-foreground">
          {t("billingIssue.emptyTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("billingIssue.emptyDescription")}
        </p>
        <CustomButton asChild className="mt-5">
          <Link to="/perfil/planes">{t("billingIssue.backToPlans")}</Link>
        </CustomButton>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-3xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-background to-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("billingIssue.badge")}
            </div>
            <h1 className="mt-3 text-3xl font-serif text-foreground">
              {t("billingIssue.title")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("billingIssue.description")}
            </p>
          </div>

          <CustomButton
            type="button"
            styleType="primary"
            className="px-4"
            onClick={() => {
              void handleOpenPortal();
            }}
            disabled={isOpeningPortal}
          >
            {isOpeningPortal ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {t("billingIssue.changePaymentMethod")}
          </CustomButton>
        </div>
      </section>

      <section className="rounded-3xl border border-border/70 bg-background/95 p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {t("billingIssue.errorTitle")}
        </h2>
        <p className="mt-2 rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm leading-6 text-foreground">
          {billingIssue.error_message}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("billingIssue.retryAttempts")}
            </p>
            <p className="mt-1 text-lg font-serif text-foreground">
              {billingIssue.retry_attempts ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("billingIssue.nextAttempt")}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {formatDateTime(
                billingIssue.next_payment_attempt_at,
                intlLocale,
                t("billingIssue.notAvailable")
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("billingIssue.graceUntil")}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {formatDateTime(
                billingIssue.grace_until,
                intlLocale,
                t("billingIssue.notAvailable")
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          {billingIssue.error_code && (
            <span className="rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-muted-foreground">
              {t("billingIssue.errorCode")}: {billingIssue.error_code}
            </span>
          )}
          {billingIssue.decline_code && (
            <span className="rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-muted-foreground">
              {t("billingIssue.declineCode")}: {billingIssue.decline_code}
            </span>
          )}
          {billingIssue.error_type && (
            <span className="rounded-full border border-border/70 bg-secondary/20 px-3 py-1 text-muted-foreground">
              {t("billingIssue.errorType")}: {billingIssue.error_type}
            </span>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {billingIssue.hosted_invoice_url && (
            <CustomButton asChild styleType="menu">
              <a
                href={billingIssue.hosted_invoice_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t("billingIssue.openInvoice")}
                <ExternalLink className="h-4 w-4" />
              </a>
            </CustomButton>
          )}
          {billingIssue.doc_url && (
            <CustomButton asChild styleType="menu">
              <a
                href={billingIssue.doc_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t("billingIssue.openHelp")}
                <ExternalLink className="h-4 w-4" />
              </a>
            </CustomButton>
          )}
          <CustomButton asChild styleType="ghost">
            <Link to="/perfil/planes">{t("billingIssue.backToPlans")}</Link>
          </CustomButton>
        </div>
      </section>
    </div>
  );
};

export default ProfileBillingIssue;
