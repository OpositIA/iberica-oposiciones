/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  cancel_path?: string;
  source?: string;
  subtopic_file_id?: number;
  success_path?: string;
};

type ExistingPurchaseRow = {
  stripe_customer_id: string | null;
};

type ExistingSubscriptionRow = {
  metadata: Record<string, unknown> | null;
};

type TargetFileRow = {
  id: number;
  file_name: string;
  opposition_id: string;
  syllabus_id: number;
  is_active: boolean;
};

type TargetSyllabusRow = {
  id: number;
  boe_id: string;
  extracted_at: string;
  is_current: boolean;
  opposition_id: string;
  published_at: string | null;
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

const PRICE_CENTS = 2999;
const CURRENCY = "eur";

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

const buildAppUrl = (baseUrl: string, path: string, fallbackPath: string) => {
  const normalizedPath = sanitizeSingleLineText(path, 240);
  const relativePath =
    normalizedPath.startsWith("/") && !normalizedPath.startsWith("//")
      ? normalizedPath
      : fallbackPath;

  return `${baseUrl}${relativePath}`;
};

const getExistingStripeCustomerId = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;

  const record = metadata as Record<string, unknown>;
  const customerId = sanitizeSingleLineText(record.stripe_customer_id, 120);
  return customerId.length > 0 ? customerId : null;
};

const buildProductName = (
  oppositionId: string,
  publishedAt: string | null,
  boeId: string
) => {
  const normalizedOppositionId = sanitizeSingleLineText(oppositionId, 120);
  const normalizedPublishedAt = sanitizeSingleLineText(publishedAt, 40);
  const normalizedBoeId = sanitizeSingleLineText(boeId, 60);

  if (normalizedPublishedAt)
    return `Temario completo ${normalizedOppositionId} ${normalizedPublishedAt}`;
  if (normalizedBoeId)
    return `Temario completo ${normalizedOppositionId} ${normalizedBoeId}`;
  return `Temario completo ${normalizedOppositionId}`;
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

  const subtopicFileId = sanitizeInteger(payload.subtopic_file_id, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER
  });
  if (!subtopicFileId)
    return json({ error: "subtopic_file_id is required" }, 400);

  const source =
    sanitizeCode(payload.source, 60) || "profile_syllabus_download_checkout";

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

  const { data: fileRow, error: fileError } = await serviceClient
    .from("opposition_subtopic_files")
    .select("id, file_name, opposition_id, syllabus_id, is_active")
    .eq("id", subtopicFileId)
    .maybeSingle();

  const file = (fileRow ?? null) as TargetFileRow | null;
  if (fileError)
    return json(
      { error: `target_file_lookup_failed:${fileError.message}` },
      400
    );
  if (!file || !file.is_active)
    return json({ error: "syllabus_pdf_not_found" }, 404);

  const { data: syllabusRow, error: syllabusError } = await serviceClient
    .from("opposition_syllabi")
    .select("id, boe_id, extracted_at, is_current, opposition_id, published_at")
    .eq("id", file.syllabus_id)
    .maybeSingle();

  const syllabus = (syllabusRow ?? null) as TargetSyllabusRow | null;
  if (syllabusError)
    return json(
      { error: `syllabus_lookup_failed:${syllabusError.message}` },
      400
    );
  if (!syllabus || !syllabus.is_current)
    return json({ error: "syllabus_download_not_available" }, 404);

  const { data: existingPurchase, error: purchaseError } = await serviceClient
    .from("syllabus_download_purchases")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .eq("syllabus_id", syllabus.id)
    .maybeSingle();

  if (purchaseError)
    return json(
      { error: `existing_purchase_lookup_failed:${purchaseError.message}` },
      400
    );
  if (existingPurchase) return json({ error: "already_purchased" }, 409);

  let existingCustomerId =
    ((existingPurchase ?? null) as ExistingPurchaseRow | null)
      ?.stripe_customer_id ?? null;

  if (!existingCustomerId) {
    const { data: latestSubscription } = await serviceClient
      .from("user_subscriptions")
      .select("metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    existingCustomerId = getExistingStripeCustomerId(
      (latestSubscription as ExistingSubscriptionRow | null)?.metadata ?? null
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient()
  });

  const baseUrl = getBaseUrl(req);
  const successUrl = buildAppUrl(
    baseUrl,
    payload.success_path ?? "",
    `/perfil/temario/descarga/${subtopicFileId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  );
  const cancelUrl = buildAppUrl(
    baseUrl,
    payload.cancel_path ?? "",
    `/perfil/temario/descarga/${subtopicFileId}?checkout=cancel`
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            unit_amount: PRICE_CENTS,
            product_data: {
              name: buildProductName(
                syllabus.opposition_id,
                syllabus.published_at,
                syllabus.boe_id
              ),
              description:
                "Pago unico por el temario completo actual. Incluye descargas ilimitadas del ZIP por bloques y PDFs independientes."
            }
          },
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer: existingCustomerId ?? undefined,
      customer_email: existingCustomerId
        ? undefined
        : (user.email ?? undefined),
      metadata: {
        purchase_type: "syllabus_download",
        user_id: user.id,
        opposition_id: syllabus.opposition_id,
        syllabus_id: String(syllabus.id),
        subtopic_file_id: String(subtopicFileId),
        source
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
