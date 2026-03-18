/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  sanitizeCode,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

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
  metadata?: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, stripe-signature, apikey, authorization",
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

const asString = (value: unknown, maxLength = 160): string | null => {
  const sanitized = sanitizeSingleLineText(value, maxLength);
  return sanitized.length > 0 ? sanitized : null;
};

const resolveObjectId = (value: string | { id: string } | null) =>
  typeof value === "string" ? value : (value?.id ?? null);

const resolveCustomerId = (
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null
) => (typeof value === "string" ? value : (value?.id ?? null));

const resolvePlanCodeFromPrice = async (
  serviceClient: ReturnType<typeof createClient>,
  stripePriceId: string | null
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
  stripeSubscriptionId: string
) => {
  const { data, error } = await serviceClient
    .from("user_subscriptions")
    .select("user_id, plan_code")
    .eq("provider_reference", stripeSubscriptionId)
    .maybeSingle();

  if (error)
    throw new Error(`load_existing_subscription_failed:${error.message}`);
  return (data ?? null) as ExistingSubscriptionRow | null;
};

const loadExistingByCustomerId = async (
  serviceClient: ReturnType<typeof createClient>,
  stripeCustomerId: string
) => {
  const { data, error } = await serviceClient
    .from("user_subscriptions")
    .select("user_id, plan_code")
    .eq("provider", "stripe")
    .eq("metadata->>stripe_customer_id", stripeCustomerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error)
    throw new Error(`load_existing_by_customer_failed:${error.message}`);
  return (data ?? null) as ExistingSubscriptionRow | null;
};

const resolveUserIdFromProfileEmail = async (
  serviceClient: ReturnType<typeof createClient>,
  email: string | null
) => {
  if (!email) return null;

  const { data, error } = await serviceClient
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`resolve_user_by_email_failed:${error.message}`);
  return sanitizeCode(data?.id, 80) || null;
};

const resolveDefaultPaidPlanCode = async (
  serviceClient: ReturnType<typeof createClient>
) => {
  const { data, error } = await serviceClient
    .from("subscription_plans")
    .select("code")
    .eq("is_active", true)
    .neq("tier", "free")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error)
    throw new Error(`default_paid_plan_lookup_failed:${error.message}`);
  return asString(data?.code, 60);
};

const syncSubscriptionState = async (
  serviceClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  options: SyncOptions
) => {
  const stripeSubscriptionId = asString(subscription.id, 120);
  if (!stripeSubscriptionId) throw new Error("stripe_subscription_id_missing");

  const existing = await loadExistingBySubscriptionId(
    serviceClient,
    stripeSubscriptionId
  );
  const stripeCustomerId = asString(
    resolveCustomerId(subscription.customer),
    120
  );
  const existingByCustomer = stripeCustomerId
    ? await loadExistingByCustomerId(serviceClient, stripeCustomerId)
    : null;

  const metadataUserId = sanitizeCode(subscription.metadata?.user_id, 80);
  const metadataPlanCode = sanitizeCode(subscription.metadata?.plan_code, 60);
  const signupMode = asString(subscription.metadata?.signup_mode, 80);
  const fallbackUserId = sanitizeCode(options.fallbackUserId, 80);
  const fallbackPlanCode = sanitizeCode(options.fallbackPlanCode, 60);

  const stripePriceId = asString(subscription.items.data[0]?.price?.id, 200);
  let resolvedPlanCode =
    metadataPlanCode ||
    fallbackPlanCode ||
    (await resolvePlanCodeFromPrice(serviceClient, stripePriceId)) ||
    asString(existing?.plan_code, 60) ||
    asString(existingByCustomer?.plan_code, 60);
  let resolvedUserId =
    metadataUserId ||
    fallbackUserId ||
    asString(existing?.user_id, 80) ||
    asString(existingByCustomer?.user_id, 80);

  if (!resolvedUserId && stripeCustomerId) {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const customerEmail = asString(
      typeof customer === "string" ? null : customer.email,
      180
    );
    resolvedUserId = await resolveUserIdFromProfileEmail(
      serviceClient,
      customerEmail
    );
  }

  if (!resolvedPlanCode)
    resolvedPlanCode = await resolveDefaultPaidPlanCode(serviceClient);

  if (!resolvedUserId && signupMode === "register_paid_signup") return;

  if (!resolvedUserId)
    throw new Error(
      `stripe_user_id_missing_for_subscription:${stripeSubscriptionId}`
    );

  if (!resolvedPlanCode)
    throw new Error(
      `stripe_plan_code_missing_for_subscription:${stripeSubscriptionId}`
    );

  const status = asString(subscription.status, 40) ?? "pending";
  const latestInvoiceId = asString(
    resolveObjectId(subscription.latest_invoice),
    120
  );

  const metadata = {
    stripe_event_type: options.eventType,
    stripe_price_id: stripePriceId,
    stripe_invoice_id: options.invoiceId ?? null,
    stripe_latest_invoice_id: latestInvoiceId,
    stripe_collection_method: asString(subscription.collection_method, 60),
    stripe_synced_from_webhook_at: new Date().toISOString(),
    ...(options.metadata ?? {})
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
      p_metadata: metadata
    }
  );

  if (error)
    throw new Error(
      `upsert_user_subscription_from_stripe_failed:${error.message}`
    );
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseServiceRoleKey = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();

  if (
    !supabaseUrl ||
    !supabaseServiceRoleKey ||
    !stripeSecretKey ||
    !stripeWebhookSecret
  )
    return json({ error: "Missing required environment variables" }, 500);

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature)
    return json({ error: "Missing stripe-signature header" }, 400);

  const rawBody = await req.text();
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient()
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      stripeSignature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Invalid Stripe signature: ${message}` }, 400);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
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
      p_payload: eventPayload
    }
  );

  if (claimError)
    return json(
      { error: `claim_webhook_event_failed:${claimError.message}` },
      500
    );

  if (claimed !== true) return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubscriptionId = resolveObjectId(session.subscription);
        if (!stripeSubscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          {
            expand: ["items.data.price"]
          }
        );

        await syncSubscriptionState(serviceClient, stripe, subscription, {
          eventType: event.type,
          fallbackUserId: sanitizeCode(
            session.metadata?.user_id ?? session.client_reference_id,
            80
          ),
          fallbackPlanCode: sanitizeCode(session.metadata?.plan_code, 60),
          checkoutSessionId: asString(session.id, 120)
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionState(serviceClient, stripe, subscription, {
          eventType: event.type
        });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId = resolveObjectId(invoice.subscription);
        if (!stripeSubscriptionId) break;

        let paymentErrorMessage: string | null = null;
        let paymentErrorCode: string | null = null;
        let paymentErrorType: string | null = null;
        let paymentDeclineCode: string | null = null;
        let paymentErrorDocUrl: string | null = null;
        const stripePaymentIntentId = asString(
          resolveObjectId(
            invoice.payment_intent as string | { id: string } | null
          ),
          120
        );

        if (stripePaymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(
              stripePaymentIntentId
            );
            const lastPaymentError = paymentIntent.last_payment_error;
            paymentErrorMessage = asString(lastPaymentError?.message, 300);
            paymentErrorCode = asString(lastPaymentError?.code, 120);
            paymentErrorType = asString(lastPaymentError?.type, 120);
            paymentDeclineCode = asString(lastPaymentError?.decline_code, 120);
            paymentErrorDocUrl = asString(lastPaymentError?.doc_url, 500);
          } catch {
            // Keep webhook processing even if payment intent details are unavailable.
          }
        }

        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          {
            expand: ["items.data.price"]
          }
        );

        await syncSubscriptionState(serviceClient, stripe, subscription, {
          eventType: event.type,
          invoiceId: asString(invoice.id, 120),
          metadata: {
            stripe_invoice_attempt_count:
              typeof invoice.attempt_count === "number" &&
              Number.isFinite(invoice.attempt_count)
                ? Math.max(0, Math.floor(invoice.attempt_count))
                : null,
            stripe_next_payment_attempt_at: toIso(invoice.next_payment_attempt),
            stripe_hosted_invoice_url: asString(
              invoice.hosted_invoice_url,
              500
            ),
            stripe_payment_intent_id: stripePaymentIntentId,
            stripe_payment_error_message:
              event.type === "invoice.payment_failed"
                ? paymentErrorMessage
                : null,
            stripe_payment_error_code:
              event.type === "invoice.payment_failed" ? paymentErrorCode : null,
            stripe_payment_error_type:
              event.type === "invoice.payment_failed" ? paymentErrorType : null,
            stripe_payment_decline_code:
              event.type === "invoice.payment_failed"
                ? paymentDeclineCode
                : null,
            stripe_payment_error_doc_url:
              event.type === "invoice.payment_failed"
                ? paymentErrorDocUrl
                : null,
            stripe_payment_recovered_at:
              event.type === "invoice.paid" ||
              event.type === "invoice.payment_succeeded"
                ? new Date().toISOString()
                : null
          }
        });
        break;
      }

      default:
        break;
    }

    const { error: processedError } = await serviceClient.rpc(
      "mark_stripe_webhook_event_processed",
      { p_event_id: event.id }
    );
    if (processedError)
      return json(
        { error: `mark_processed_failed:${processedError.message}` },
        500
      );

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.rpc("mark_stripe_webhook_event_failed", {
      p_event_id: event.id,
      p_error: message
    });
    return json({ error: message }, 500);
  }
});
