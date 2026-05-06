/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type RequestPayload = {
  reason?: string;
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

const sanitizeSingleLineText = (value: unknown, maxLength = 500) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return "";

  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

const parseJsonBody = async <T>(req: Request): Promise<T> => {
  const raw = await req.text();
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const extractBearerToken = (authHeader: string | null) =>
  authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";

const buildDeletedEmail = (userId: string) =>
  `deleted+${userId.replace(/[^a-zA-Z0-9]/g, "")}.${Date.now()}@deleted.local`;

const buildRandomPassword = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
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

  if (!supabaseUrl || !supabaseServiceRoleKey)
    return json({ error: "Missing required environment variables" }, 500);

  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) return json({ error: "Missing Authorization header" }, 401);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const {
    data: { user },
    error: userError
  } = await serviceClient.auth.getUser(token);

  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const deletedAuthEmail = buildDeletedEmail(user.id);
  const deletedAt = new Date().toISOString();
  const deletionReason = sanitizeSingleLineText(payload.reason, 500) || null;

  const { error: authUpdateError } =
    await serviceClient.auth.admin.updateUserById(user.id, {
      email: deletedAuthEmail,
      password: buildRandomPassword(),
      user_metadata: {
        deleted: true,
        deleted_at: deletedAt
      }
    });

  if (authUpdateError) return json({ error: authUpdateError.message }, 500);

  // Eliminar todas las identities OAuth para que el email quede libre en futuros registros.
  // updateUserById solo anonimiza la identity de 'email'; las de Google/OAuth conservan
  // el email original y causarían que Supabase relinkie al usuario eliminado.
  const { error: identitiesError } = await serviceClient.rpc(
    "purge_soft_deleted_identities",
    { p_user_id: user.id }
  );

  if (identitiesError) return json({ error: identitiesError.message }, 500);

  const { error: profileUpdateError } = await serviceClient
    .from("profiles")
    .update({
      is_deleted: true,
      deleted_at: deletedAt,
      deletion_reason: deletionReason,
      deleted_auth_email: deletedAuthEmail,
      email: null,
      first_name: null,
      last_name: null,
      full_name: null,
      date_of_birth: null,
      preferred_opposition: null,
      preferred_opposition_id: null,
      avatar_url: null,
      product_updates_email_enabled: false
    })
    .eq("user_id", user.id);

  if (profileUpdateError)
    return json({ error: profileUpdateError.message }, 500);

  return json({ ok: true });
});
