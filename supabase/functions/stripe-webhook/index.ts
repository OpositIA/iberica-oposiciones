/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { sanitizeCode, sanitizeSingleLineText } from "../_shared/inputSanitization.ts";

type ExistingSubscriptionRow = {
  user_id: string;
  plan_code: string;
};

type SyncOptions = {
  eventType: string;
  fallbackUserId?: string | null;
  fallbackPlanCode?: string | null;
  checkoutSessionId?: string | null;
  invoiceId?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, stripe-signature, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const toIso = (unixSeconds: number | null | undefined) =>
  typeof unixSeconds === "number" && Number.isFinite(unixSeconds)
    ? new Date(unixSeconds * 1000).toISOString()
    : null;

const asString = (value: unknown, maxLength = 160): string | null => {
  const sanitized = sanitizeSingleLineText(value, maxLength);
  return sanitized.length > 0 ? sanitized : null;
};

const resolveObjectId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : value?.id ?? null;

const resolveCustomerId = (value: string | Stripe.Customer | Stripe.DeletedCustomer | null) =>
  typeof value === "string" ? value : value?.id ?? null;

const resolvePlanCodeFromPrice = async (
  serviceClient: ReturnType<typeof createClient>,
  stripePriceId: string | null,
) => {
  if (!stripePriceId) return null;

  const { data, error } = await serviceClient
    .from("subscription_plans")
    .select("code")
    .eq("stripe_price_id", stripePriceId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`price_plan_lookup_failed:${error.message}`);
  return asString(data?.code, 60);
};

const loadExistingBySubscriptionId = async (
  serviceClient: ReturnType<typeof createClient>,
  stripeSubscriptionId: string,
) => {
  const { data, error } = await serviceClient
    .from("user_subscriptions")
    .select("user_id, plan_code")
    .eq("provider_reference", stripeSubscriptionId)
    .maybeSingle();

  if (error) throw new Error(`load_existing_subscription_failed:${error.message}`);
  return (data ?? null) as ExistingSubscriptionRow | null;
};

const syncSubscriptionState = async (
  serviceClient: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
  options: SyncOptions,
) => {
  const stripeSubscriptionId = asString(subscription.id, 120);
  if (!stripeSubscriptionId)
    throw new Error("stripe_subscription_id_missing");

  const existing = await loadExistingBySubscriptionId(
    serviceClient,
    stripeSubscriptionId,
  );

  const metadataUserId = sanitizeCode(subscription.metadata?.user_id, 80);
  const metadataPlanCode = sanitizeCode(subscription.metadata?.plan_code, 60);
  const fallbackUserId = sanitizeCode(options.fallbackUserId, 80);
  const fallbackPlanCode = sanitizeCode(options.fallbackPlanCode, 60);

  const stripePriceId = asString(subscription.items.data[0]?.price?.id, 200);
  const resolvedPlanCode = metadataPlanCode
    || fallbackPlanCode
    || (await resolvePlanCodeFromPrice(serviceClient, stripePriceId))
    || asString(existing?.plan_code, 60);
  const resolvedUserId =
    metadataUserId || fallbackUserId || asString(existing?.user_id, 80);

  if (!resolvedUserId)
    throw new Error(`stripe_user_id_missing_for_subscription:${stripeSubscriptionId}`);

  if (!resolvedPlanCode)
    throw new Error(`stripe_plan_code_missing_for_subscription:${stripeSubscriptionId}`);

  const stripeCustomerId = asString(
    resolveCustomerId(subscription.customer),
    120,
  );
  const status = asString(subscription.status, 40) ?? "pending";
  const latestInvoiceId = asString(resolveObjectId(subscription.latest_invoice), 120);

  const metadata = {
    stripe_event_type: options.eventType,
    stripe_price_id: stripePriceId,
    stripe_invoice_id: options.invoiceId ?? null,
    stripe_latest_invoice_id: latestInvoiceId,
    stripe_collection_method: asString(subscription.collection_method, 60),
    stripe_synced_from_webhook_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.rpc(
    "upsert_user_subscription_from_stripe",
    {
      p_user_id: resolvedUserId,
      p_plan_code: resolvedPlanCode,
      p_stripe_subscription_id: stripeSubscriptionId,
      p_stripe_customer_id: stripeCustomerId,
      p_subscription_status: status,
      p_current_period_start: toIso(subscription.current_period_start),
      p_current_period_end: toIso(subscription.current_period_end),
      p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      p_canceled_at: toIso(subscription.canceled_at),
      p_ended_at: toIso(subscription.ended_at),
      p_checkout_session_id: asString(options.checkoutSessionId, 120),
      p_metadata: metadata,
    },
  );

  if (error)
    throw new Error(`upsert_user_subscription_from_stripe_failed:${error.message}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey || !stripeWebhookSecret)
    return json({ error: "Missing required environment variables" }, 500);

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature)
    return json({ error: "Missing stripe-signature header" }, 400);

  const rawBody = await req.text();
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      stripeSignature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Invalid Stripe signature: ${message}` }, 400);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const eventPayload = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  })();

  const { data: claimed, error: claimError } = await serviceClient.rpc(
    "claim_stripe_webhook_event",
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload: eventPayload,
    },
  );

  if (claimError)
    return json({ error: `claim_webhook_event_failed:${claimError.message}` }, 500);

  if (claimed !== true)
    return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubscriptionId = resolveObjectId(session.subscription);
        if (!stripeSubscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
          expand: ["items.data.price"],
        });

        await syncSubscriptionState(serviceClient, subscription, {
          eventType: event.type,
          fallbackUserId: sanitizeCode(
            session.metadata?.user_id ?? session.client_reference_id,
            80,
          ),
          fallbackPlanCode: sanitizeCode(session.metadata?.plan_code, 60),
          checkoutSessionId: asString(session.id, 120),
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionState(serviceClient, subscription, {
          eventType: event.type,
        });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId = resolveObjectId(invoice.subscription);
        if (!stripeSubscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
          expand: ["items.data.price"],
        });

        await syncSubscriptionState(serviceClient, subscription, {
          eventType: event.type,
          invoiceId: asString(invoice.id, 120),
        });
        break;
      }

      default:
        break;
    }

    const { error: processedError } = await serviceClient.rpc(
      "mark_stripe_webhook_event_processed",
      { p_event_id: event.id },
    );
    if (processedError)
      return json({ error: `mark_processed_failed:${processedError.message}` }, 500);

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.rpc("mark_stripe_webhook_event_failed", {
      p_event_id: event.id,
      p_error: message,
    });
    return json({ error: message }, 500);
  }
});
