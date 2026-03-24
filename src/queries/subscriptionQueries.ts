import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { useQuery } from "@tanstack/react-query";

const SUBSCRIPTION_QUERY_STALE_MS = 60 * 1000;
const SUBSCRIPTION_QUERY_GC_MS = 15 * 60 * 1000;
const FALLBACK_TIMEZONE = "Europe/Madrid";

const resolveTimezone = () => {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function")
    return FALLBACK_TIMEZONE;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof timezone === "string" && timezone.trim().length > 0
    ? timezone
    : FALLBACK_TIMEZONE;
};

const normalizeInt = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

export const subscriptionQueryConfig = {
  staleTime: SUBSCRIPTION_QUERY_STALE_MS,
  gcTime: SUBSCRIPTION_QUERY_GC_MS,
  refetchOnMount: "always" as const
};

export const subscriptionQueryKeys = {
  publicPlans: ["subscriptions", "public-plans"] as const,
  userPlan: (userId: string) => ["subscriptions", "user-plan", userId] as const,
  billingIssue: (userId: string) =>
    ["subscriptions", "billing-issue", userId] as const
};

export type PublicSubscriptionPlanRow = Pick<
  Tables<"subscription_plans">,
  | "code"
  | "name"
  | "tier"
  | "billing_interval"
  | "price_cents"
  | "currency"
  | "description"
  | "ai_daily_limit"
  | "quick_test_question_limit"
  | "sort_order"
>;

export type UserPlanStateRow = {
  plan_code: string;
  plan_name: string;
  tier: string;
  billing_interval: string;
  subscription_status: string;
  is_paid: boolean;
  ai_daily_limit: number;
  quick_test_question_limit: number;
  ai_used: number;
  ai_remaining: number;
  day: string;
  price_cents: number;
  effective_price_cents: number;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  discount_code: string | null;
  discount_percent: number | null;
  discount_ends_at: string | null;
};

export type UserBillingIssueRow = {
  subscription_id: string;
  plan_code: string;
  subscription_status: string;
  current_period_end: string | null;
  updated_at: string | null;
  error_message: string;
  error_code: string | null;
  error_type: string | null;
  decline_code: string | null;
  doc_url: string | null;
  hosted_invoice_url: string | null;
  next_payment_attempt_at: string | null;
  failed_at: string | null;
  grace_until: string | null;
  retry_attempts: number | null;
};

type CheckoutSessionResponse = {
  checkout_url?: string;
  session_id?: string;
  error?: string;
};

type CompletePaidSignupResponse = {
  ok?: boolean;
  error?: string;
  send_email?: boolean;
  auto_login?: boolean;
  access_token?: string;
  refresh_token?: string;
};

type CompleteFreeSignupResponse = {
  ok?: boolean;
  error?: string;
  send_email?: boolean;
  auto_login?: boolean;
  access_token?: string;
  refresh_token?: string;
};

type CustomerPortalSessionResponse = {
  portal_url?: string;
  error?: string;
};

const normalizePlanStateRow = (
  row: Record<string, unknown>
): UserPlanStateRow => ({
  plan_code: sanitizeCode(row.plan_code, 60) || "free-monthly",
  plan_name:
    typeof row.plan_name === "string" && row.plan_name.trim().length > 0
      ? row.plan_name.trim()
      : "Gratis",
  tier:
    typeof row.tier === "string" && row.tier.trim().length > 0
      ? row.tier.trim()
      : "free",
  billing_interval:
    typeof row.billing_interval === "string" &&
    row.billing_interval.trim().length > 0
      ? row.billing_interval.trim()
      : "monthly",
  subscription_status:
    typeof row.subscription_status === "string" &&
    row.subscription_status.trim().length > 0
      ? row.subscription_status.trim()
      : "active",
  is_paid: Boolean(row.is_paid),
  ai_daily_limit: normalizeInt(row.ai_daily_limit, 3),
  quick_test_question_limit: normalizeInt(row.quick_test_question_limit, 20),
  ai_used: normalizeInt(row.ai_used, 0),
  ai_remaining: normalizeInt(row.ai_remaining, 0),
  day:
    typeof row.day === "string" && row.day.trim().length > 0
      ? row.day.trim()
      : "",
  price_cents: normalizeInt(row.price_cents, 0),
  effective_price_cents: normalizeInt(
    row.effective_price_cents,
    normalizeInt(row.price_cents, 0)
  ),
  currency:
    typeof row.currency === "string" && row.currency.trim().length > 0
      ? row.currency.trim()
      : "EUR",
  current_period_end:
    typeof row.current_period_end === "string" &&
    row.current_period_end.trim().length > 0
      ? row.current_period_end.trim()
      : null,
  cancel_at_period_end: Boolean(row.cancel_at_period_end),
  discount_code:
    typeof row.discount_code === "string" && row.discount_code.trim().length > 0
      ? row.discount_code.trim()
      : null,
  discount_percent:
    typeof row.discount_percent === "number" &&
    Number.isFinite(row.discount_percent)
      ? Math.max(0, Math.floor(row.discount_percent))
      : null,
  discount_ends_at:
    typeof row.discount_ends_at === "string" &&
    row.discount_ends_at.trim().length > 0
      ? row.discount_ends_at.trim()
      : null
});

const asMetadataRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const readMetadataString = (
  metadata: Record<string, unknown> | null,
  key: string,
  maxLength = 220
) => {
  if (!metadata) return null;
  const value = sanitizeSingleLineText(metadata[key], maxLength);
  return value.length > 0 ? value : null;
};

const readMetadataInt = (
  metadata: Record<string, unknown> | null,
  key: string
) => {
  if (!metadata) return null;
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, Math.floor(value));

  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
};

export const fetchPublicSubscriptionPlans = async (): Promise<
  PublicSubscriptionPlanRow[]
> => {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "code, name, tier, billing_interval, price_cents, currency, description, ai_daily_limit, quick_test_question_limit, sort_order"
    )
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PublicSubscriptionPlanRow[];
};

export const fetchUserPlanState = async (
  userId: string,
  timezone = resolveTimezone()
): Promise<UserPlanStateRow | null> => {
  const { data, error } = await supabase.rpc("get_user_plan_state", {
    p_user_id: userId,
    p_tz: timezone
  });

  if (error) throw error;
  const row = data?.[0];
  if (!row || typeof row !== "object") return null;
  return normalizePlanStateRow(row as Record<string, unknown>);
};

export const fetchUserBillingIssue = async (
  userId: string
): Promise<UserBillingIssueRow | null> => {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("id, plan_code, status, current_period_end, updated_at, metadata")
    .eq("user_id", userId)
    .eq("provider", "stripe")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (typeof data.status !== "string" || data.status.trim() !== "past_due")
    return null;

  const metadata = asMetadataRecord(data.metadata);
  const errorMessage =
    readMetadataString(metadata, "stripe_payment_error_message", 320) ??
    "No hemos podido cobrar tu ultima factura. Actualiza tu metodo de pago para mantener Premium.";

  return {
    subscription_id: sanitizeCode(data.id, 120),
    plan_code: sanitizeCode(data.plan_code, 60) || "pro-monthly",
    subscription_status: sanitizeCode(data.status, 40) || "past_due",
    current_period_end:
      typeof data.current_period_end === "string" &&
      data.current_period_end.trim().length > 0
        ? data.current_period_end.trim()
        : null,
    updated_at:
      typeof data.updated_at === "string" && data.updated_at.trim().length > 0
        ? data.updated_at.trim()
        : null,
    error_message: errorMessage,
    error_code: readMetadataString(metadata, "stripe_payment_error_code", 120),
    error_type: readMetadataString(metadata, "stripe_payment_error_type", 120),
    decline_code: readMetadataString(
      metadata,
      "stripe_payment_decline_code",
      120
    ),
    doc_url: readMetadataString(metadata, "stripe_payment_error_doc_url", 500),
    hosted_invoice_url: readMetadataString(
      metadata,
      "stripe_hosted_invoice_url",
      500
    ),
    next_payment_attempt_at: readMetadataString(
      metadata,
      "stripe_next_payment_attempt_at",
      80
    ),
    failed_at: readMetadataString(metadata, "billing_failed_at", 80),
    grace_until: readMetadataString(metadata, "billing_grace_until", 80),
    retry_attempts: readMetadataInt(metadata, "billing_retry_attempts")
  };
};

export const changeUserSubscriptionPlan = async (
  planCode: string,
  timezone = resolveTimezone()
): Promise<UserPlanStateRow> => {
  const { data, error } = await supabase.rpc("change_user_subscription_plan", {
    p_plan_code: sanitizeCode(planCode, 60),
    p_tz: timezone
  });

  if (error) throw error;
  const row = data?.[0];
  if (!row || typeof row !== "object")
    throw new Error("No se pudo cambiar el plan.");
  return normalizePlanStateRow(row as Record<string, unknown>);
};

export const applyUserDiscountCode = async (
  code: string,
  timezone = resolveTimezone()
): Promise<UserPlanStateRow> => {
  const { data, error } = await supabase.rpc("apply_discount_code", {
    p_code: sanitizeCode(code, 80),
    p_tz: timezone
  });

  if (error) throw error;
  const row = data?.[0];
  if (!row || typeof row !== "object")
    throw new Error("No se pudo aplicar el codigo de descuento.");
  return normalizePlanStateRow(row as Record<string, unknown>);
};

export const createStripeCheckoutSession = async ({
  planCode,
  source
}: {
  planCode: string;
  source: "app_plans" | "plan_selection";
}): Promise<{ checkoutUrl: string; sessionId: string }> => {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para iniciar la pasarela de pago.");

  const { data, error } =
    await supabase.functions.invoke<CheckoutSessionResponse>(
      "create-checkout-session",
      {
        body: {
          plan_code: sanitizeCode(planCode, 60),
          source: sanitizeCode(source, 60)
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

  if (error) {
    let message = "No se pudo iniciar la pasarela de pago.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  const checkoutUrl =
    typeof data?.checkout_url === "string" ? data.checkout_url.trim() : "";
  const sessionId =
    typeof data?.session_id === "string" ? data.session_id.trim() : "";

  if (!checkoutUrl)
    throw new Error("La pasarela de pago no devolvio una URL valida.");

  return {
    checkoutUrl,
    sessionId
  };
};

export const createPublicStripeCheckoutSession = async ({
  planCode,
  email,
  successPath,
  cancelPath
}: {
  planCode: string;
  email: string;
  successPath: string;
  cancelPath: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> => {
  const { data, error } =
    await supabase.functions.invoke<CheckoutSessionResponse>(
      "create-checkout-session",
      {
        body: {
          plan_code: sanitizeCode(planCode, 60),
          source: "register_paid_signup",
          email: sanitizeSingleLineText(email, 180),
          success_path: sanitizeSingleLineText(successPath, 240),
          cancel_path: sanitizeSingleLineText(cancelPath, 240)
        }
      }
    );

  if (error) {
    let message = "No se pudo iniciar la pasarela de pago.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  const checkoutUrl =
    typeof data?.checkout_url === "string" ? data.checkout_url.trim() : "";
  const sessionId =
    typeof data?.session_id === "string" ? data.session_id.trim() : "";

  if (!checkoutUrl)
    throw new Error("La pasarela de pago no devolvio una URL valida.");

  return {
    checkoutUrl,
    sessionId
  };
};

export const completePaidSignupAfterCheckout = async ({
  sessionId,
  form,
  locale
}: {
  sessionId: string;
  form: {
    name: string;
    lastName: string;
    email: string;
    password: string;
    dateOfBirth: string;
    preferredOpposition: string;
  };
  locale: string;
}) => {
  const { data, error } =
    await supabase.functions.invoke<CompletePaidSignupResponse>(
      "complete-paid-signup",
      {
        body: {
          session_id: sanitizeSingleLineText(sessionId, 120),
          locale: sanitizeCode(locale, 12),
          first_name: sanitizeSingleLineText(form.name, 80),
          last_name: sanitizeSingleLineText(form.lastName, 120),
          email: sanitizeSingleLineText(form.email, 180),
          password: typeof form.password === "string" ? form.password : "",
          date_of_birth: sanitizeSingleLineText(form.dateOfBirth, 20),
          preferred_opposition_id: sanitizeCode(form.preferredOpposition, 120)
        }
      }
    );

  if (error) {
    let message = "No se pudo completar el registro tras el pago.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  if (data?.ok !== true) {
    throw new Error(
      typeof data?.error === "string" && data.error.trim().length > 0
        ? data.error.trim()
        : "No se pudo completar el registro tras el pago."
    );
  }

  return {
    autoLogin: data?.auto_login === true,
    accessToken:
      typeof data?.access_token === "string" ? data.access_token.trim() : "",
    refreshToken:
      typeof data?.refresh_token === "string" ? data.refresh_token.trim() : ""
  };
};

export const completeFreeSignup = async ({
  form,
  locale
}: {
  form: {
    name: string;
    lastName: string;
    email: string;
    password: string;
    dateOfBirth: string;
    preferredOpposition: string;
  };
  locale: string;
}) => {
  const { data, error } =
    await supabase.functions.invoke<CompleteFreeSignupResponse>(
      "complete-free-signup",
      {
        body: {
          locale: sanitizeCode(locale, 12),
          first_name: sanitizeSingleLineText(form.name, 80),
          last_name: sanitizeSingleLineText(form.lastName, 120),
          email: sanitizeSingleLineText(form.email, 180),
          password: typeof form.password === "string" ? form.password : "",
          date_of_birth: sanitizeSingleLineText(form.dateOfBirth, 20),
          preferred_opposition_id: sanitizeCode(form.preferredOpposition, 120)
        }
      }
    );

  if (error) {
    let message = "No se pudo completar el registro.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  if (data?.ok !== true) {
    throw new Error(
      typeof data?.error === "string" && data.error.trim().length > 0
        ? data.error.trim()
        : "No se pudo completar el registro."
    );
  }

  return {
    sendEmail: data?.send_email !== false,
    autoLogin: data?.auto_login === true,
    accessToken:
      typeof data?.access_token === "string" ? data.access_token.trim() : "",
    refreshToken:
      typeof data?.refresh_token === "string" ? data.refresh_token.trim() : ""
  };
};

export const createCustomerPortalSession = async ({
  returnPath = "/perfil/planes"
}: {
  returnPath?: string;
}): Promise<{ portalUrl: string }> => {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para gestionar el metodo de pago.");

  const { data, error } =
    await supabase.functions.invoke<CustomerPortalSessionResponse>(
      "create-customer-portal-session",
      {
        body: {
          return_path: sanitizeSingleLineText(returnPath, 120)
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

  if (error) {
    let message = "No se pudo abrir la gestion de pagos.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  const portalUrl =
    typeof data?.portal_url === "string" ? data.portal_url.trim() : "";
  if (!portalUrl)
    throw new Error("No se pudo generar la URL de gestion de pagos.");

  return { portalUrl };
};

export const usePublicSubscriptionPlansQuery = () =>
  useQuery({
    queryKey: subscriptionQueryKeys.publicPlans,
    queryFn: fetchPublicSubscriptionPlans,
    ...subscriptionQueryConfig
  });

export const useUserPlanStateQuery = (
  userId: string | null | undefined,
  timezone?: string
) =>
  useQuery({
    queryKey: userId
      ? subscriptionQueryKeys.userPlan(userId)
      : ["subscriptions", "user-plan", "guest"],
    queryFn: () => fetchUserPlanState(userId as string, timezone),
    enabled: Boolean(userId),
    ...subscriptionQueryConfig
  });

export const useUserBillingIssueQuery = (userId: string | null | undefined) =>
  useQuery({
    queryKey: userId
      ? subscriptionQueryKeys.billingIssue(userId)
      : ["subscriptions", "billing-issue", "guest"],
    queryFn: () => fetchUserBillingIssue(userId as string),
    enabled: Boolean(userId),
    ...subscriptionQueryConfig
  });
