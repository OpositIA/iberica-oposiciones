/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  plan_code?: string;
  source?: string;
};

type PublicPlanRow = {
  code: string;
  name: string;
  tier: string;
  billing_interval: string;
  currency: string;
  price_cents: number;
  stripe_price_id: string | null;
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

const getBaseUrl = (req: Request) => {
  const candidates = [
    req.headers.get("origin")?.trim() ?? "",
    Deno.env.get("APP_BASE_URL")?.trim() ?? "",
    "http://localhost:8080"
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      return `${url.protocol}//${url.host}`;
    } catch {
      continue;
    }
  }

  return "http://localhost:8080";
};

const getExistingStripeCustomerId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;

  const record = metadata as Record<string, unknown>;
  const customerId = sanitizeSingleLineText(record.stripe_customer_id, 120);
  return customerId.length > 0 ? customerId : null;
};

const hasPaidAccessFromSubscription = (status: unknown, _metadata: unknown) => {
  const normalizedStatus = sanitizeSingleLineText(status, 40).toLowerCase();
  return normalizedStatus === "active" || normalizedStatus === "trialing";
};

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const requestedPlanCode =
    sanitizeCode(payload.plan_code, 60) || "pro-monthly";
  const source = sanitizeCode(payload.source, 60) || "app_plans";

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

  const user = authData.user;

  const { data: planData, error: planError } = await serviceClient
    .from("subscription_plans")
    .select(
      "code, name, tier, billing_interval, currency, price_cents, stripe_price_id"
    )
    .eq("code", requestedPlanCode)
    .eq("is_active", true)
    .eq("is_public", true)
    .maybeSingle();

  const plan = (planData ?? null) as PublicPlanRow | null;

  if (planError) return json({ error: planError.message }, 400);

  if (!plan) return json({ error: "subscription_plan_not_found" }, 404);

  if (plan.tier === "free" || Number(plan.price_cents ?? 0) <= 0)
    return json({ error: "plan_must_be_paid" }, 400);

  const { data: currentPaid } = await serviceClient
    .from("user_subscriptions")
    .select("provider, provider_reference, plan_code, status, metadata")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .eq("provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isCurrentPaid = hasPaidAccessFromSubscription(
    currentPaid?.status,
    currentPaid?.metadata
  );

  if (
    isCurrentPaid &&
    currentPaid?.provider_reference &&
    sanitizeCode(currentPaid?.plan_code, 60) === requestedPlanCode
  )
    return json({ error: "already_subscribed" }, 409);

  const { data: latestSubscription } = await serviceClient
    .from("user_subscriptions")
    .select("metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingCustomerId = getExistingStripeCustomerId(
    latestSubscription?.metadata
  );

  const stripeCurrency =
    sanitizeSingleLineText(plan.currency, 10).toLowerCase() || "eur";
  const stripePlanName = sanitizeSingleLineText(plan.name, 120) || "Premium";
  const recurringInterval =
    plan.billing_interval === "yearly" ? "year" : "month";

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient()
  });

  const baseUrl = getBaseUrl(req);
  const successUrl = `${baseUrl}/perfil/planes?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/perfil/planes?checkout=cancel`;

  try {
    const lineItems =
      plan.stripe_price_id && plan.stripe_price_id.trim().length > 0
        ? [{ price: plan.stripe_price_id.trim(), quantity: 1 }]
        : [
            {
              price_data: {
                currency: stripeCurrency,
                unit_amount: Number(plan.price_cents ?? 0),
                product_data: {
                  name: stripePlanName
                },
                recurring: {
                  interval: recurringInterval
                }
              },
              quantity: 1
            }
          ];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer: existingCustomerId ?? undefined,
      customer_email: existingCustomerId
        ? undefined
        : (user.email ?? undefined),
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        plan_code: requestedPlanCode,
        source
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_code: requestedPlanCode,
          source
        }
      }
    });

    if (!session.url)
      return json({ error: "stripe_checkout_url_missing" }, 500);

    return json({
      checkout_url: session.url,
      session_id: session.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
