/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  parseJsonBody,
  sanitizeSingleLineText,
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  return_path?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const getBaseUrl = (req: Request) => {
  const candidates = [
    req.headers.get("origin")?.trim() ?? "",
    Deno.env.get("APP_BASE_URL")?.trim() ?? "",
    "http://localhost:8080",
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

const normalizeReturnPath = (value: unknown) => {
  const fallback = "/perfil/planes";
  const sanitized = sanitizeSingleLineText(value, 180);
  if (!sanitized) return fallback;
  if (!sanitized.startsWith("/")) return fallback;
  if (sanitized.startsWith("//")) return fallback;
  return sanitized;
};

const resolveStripeCustomerId = async ({
  serviceClient,
  stripe,
  userId,
}: {
  serviceClient: ReturnType<typeof createClient>;
  stripe: Stripe;
  userId: string;
}): Promise<string | null> => {
  const { data: latestSubscription, error } = await serviceClient
    .from("user_subscriptions")
    .select("provider_reference, metadata")
    .eq("user_id", userId)
    .eq("provider", "stripe")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`load_user_subscription_failed:${error.message}`);

  const metadata =
    latestSubscription?.metadata
      && typeof latestSubscription.metadata === "object"
      && !Array.isArray(latestSubscription.metadata)
      ? (latestSubscription.metadata as Record<string, unknown>)
      : null;

  const metadataCustomerId = sanitizeSingleLineText(
    metadata?.stripe_customer_id,
    120,
  );
  if (metadataCustomerId) return metadataCustomerId;

  const stripeSubscriptionId = sanitizeSingleLineText(
    latestSubscription?.provider_reference,
    120,
  );
  if (!stripeSubscriptionId) return null;

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const customerId = sanitizeSingleLineText(
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id,
    120,
  );

  return customerId || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey)
    return json({ error: "Missing required environment variables" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return json({ error: "Missing Authorization header" }, 401);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user)
    return json({ error: "Unauthorized" }, 401);

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const customerId = await resolveStripeCustomerId({
      serviceClient,
      stripe,
      userId: authData.user.id,
    });

    if (!customerId)
      return json({ error: "stripe_customer_not_found" }, 404);

    const baseUrl = getBaseUrl(req);
    const returnPath = normalizeReturnPath(payload.return_path);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}${returnPath}`,
    });

    return json({ portal_url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
