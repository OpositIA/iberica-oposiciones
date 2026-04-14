/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

type RequestPayload = {
  session_id?: string;
  locale?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  date_of_birth?: string;
  preferred_opposition_id?: string;
  email_redirect_to?: string;
};

type UserMetadataPayload = {
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string | null;
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
  locale: string;
};

const sanitizeText = (value: unknown, maxLength = Number.POSITIVE_INFINITY) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return "";

  let sanitized = String(value).replace(/[\u0000-\u001F\u007F]/g, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  if (Number.isFinite(maxLength) && maxLength >= 0)
    sanitized = sanitized.slice(0, maxLength);

  return sanitized;
};

const sanitizeSingleLineText = (value: unknown, maxLength = 200) =>
  sanitizeText(value, maxLength);

const sanitizeCode = (value: unknown, maxLength = 120) =>
  sanitizeSingleLineText(value, maxLength).replace(/[^A-Za-z0-9._:-]/g, "");

const parseJsonBody = async <T>(req: Request): Promise<T> => {
  const raw = await req.text();
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const toIso = (unixSeconds: number | null | undefined) =>
  typeof unixSeconds === "number" && Number.isFinite(unixSeconds)
    ? new Date(unixSeconds * 1000).toISOString()
    : null;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const supabaseServiceRoleKey = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey ||
    !stripeSecretKey
  )
    return json({ error: "Missing required environment variables" }, 500);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const sessionId = sanitizeSingleLineText(payload.session_id, 120);
  const firstName = sanitizeSingleLineText(payload.first_name, 80);
  const lastName = sanitizeSingleLineText(payload.last_name, 120);
  const email = sanitizeSingleLineText(payload.email, 180).toLowerCase();
  const password =
    typeof payload.password === "string" ? payload.password.trim() : "";
  const dateOfBirth = sanitizeSingleLineText(payload.date_of_birth, 20);
  const preferredOppositionId = sanitizeCode(
    payload.preferred_opposition_id,
    120
  );
  const locale = sanitizeCode(payload.locale, 12) || "es";
  const emailRedirectTo = sanitizeSingleLineText(
    payload.email_redirect_to,
    240
  );
  const userMetadata: UserMetadataPayload = {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    date_of_birth: dateOfBirth || null,
    preferred_opposition_id: preferredOppositionId || null,
    preferred_opposition: preferredOppositionId || null,
    locale
  };

  if (!sessionId) return json({ error: "session_id_required" }, 400);
  if (!firstName || !lastName) return json({ error: "name_required" }, 400);
  if (!/\S+@\S+\.\S+/.test(email))
    return json({ error: "valid_email_required" }, 400);
  if (password.length < 8) return json({ error: "password_too_short" }, 400);

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient()
  });
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"]
    });

    if (session.mode !== "subscription")
      return json({ error: "invalid_checkout_mode" }, 400);

    if (session.status !== "complete")
      return json({ error: "checkout_not_completed" }, 400);

    if (
      sanitizeSingleLineText(session.metadata?.signup_mode, 80) !==
      "register_paid_signup"
    )
      return json({ error: "invalid_signup_mode" }, 400);

    const planCode = sanitizeCode(session.metadata?.plan_code, 60);
    const sessionEmail = sanitizeSingleLineText(
      session.customer_details?.email ??
        session.customer_email ??
        session.metadata?.signup_email,
      180
    ).toLowerCase();

    if (!planCode) return json({ error: "missing_plan_code" }, 400);
    if (!sessionEmail || sessionEmail !== email)
      return json({ error: "checkout_email_mismatch" }, 400);

    const subscription =
      typeof session.subscription === "object" && session.subscription
        ? (session.subscription as Stripe.Subscription)
        : null;

    if (!subscription?.id) return json({ error: "missing_subscription" }, 400);

    const { data: existingSubscription } = await serviceClient
      .from("user_subscriptions")
      .select("id")
      .eq("provider_reference", subscription.id)
      .maybeSingle();

    if (existingSubscription?.id) return json({ ok: true });

    let userId = "";
    let accessToken = "";
    let refreshToken = "";
    let autoLogin = false;
    let sendEmail = false;

    const { data: signUpData, error: signUpError } =
      await anonClient.auth.signUp({
        email,
        password,
        options: {
          data: userMetadata,
          ...(emailRedirectTo ? { emailRedirectTo } : {})
        }
      });

    if (signUpError) {
      return json({ error: signUpError.message }, 400);
    } else {
      userId = sanitizeCode(signUpData.user?.id, 80);
      sendEmail = true;
    }

    if (!userId) return json({ error: "signup_user_id_missing" }, 500);

    const { error: upsertError } = await serviceClient.rpc(
      "upsert_user_subscription_from_stripe",
      {
        p_user_id: userId,
        p_plan_code: planCode,
        p_stripe_subscription_id: sanitizeSingleLineText(subscription.id, 120),
        p_stripe_customer_id: sanitizeSingleLineText(
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id,
          120
        ),
        p_subscription_status:
          sanitizeSingleLineText(subscription.status, 40) || "active",
        p_current_period_start: toIso(subscription.current_period_start),
        p_current_period_end: toIso(subscription.current_period_end),
        p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        p_canceled_at: toIso(subscription.canceled_at),
        p_ended_at: toIso(subscription.ended_at),
        p_checkout_session_id: sanitizeSingleLineText(session.id, 120),
        p_metadata: {
          stripe_event_type: "complete_paid_signup",
          stripe_price_id: sanitizeSingleLineText(
            subscription.items.data[0]?.price?.id,
            200
          ),
          stripe_latest_invoice_id: sanitizeSingleLineText(
            typeof subscription.latest_invoice === "string"
              ? subscription.latest_invoice
              : subscription.latest_invoice?.id,
            120
          ),
          stripe_collection_method: sanitizeSingleLineText(
            subscription.collection_method,
            60
          ),
          stripe_synced_from_webhook_at: new Date().toISOString(),
          signup_mode: "register_paid_signup"
        }
      }
    );

    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({
      ok: true,
      send_email: sendEmail,
      auto_login: autoLogin,
      access_token: autoLogin ? accessToken : "",
      refresh_token: autoLogin ? refreshToken : ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
