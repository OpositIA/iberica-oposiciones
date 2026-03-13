/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeInteger,
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  limit?: unknown;
  max_laws?: unknown;
  force?: unknown;
  dry_run?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MAX_LAWS = 5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

async function getRuntimeSecret(
  supabase: ReturnType<typeof createServiceClient>,
  name: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_runtime_secret", { p_name: name });
  if (error) throw new Error(`get_runtime_secret(${name}) failed: ${error.message}`);
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function ensureEdgeSecret(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Response | null> {
  const expected = await getRuntimeSecret(supabase, "rag_edge_secret");
  if (!expected) return json({ error: "Missing rag_edge_secret" }, 500);

  const received = req.headers.get("x-edge-secret")?.trim();
  if (!received || received !== expected)
    return json({ error: "Unauthorized (x-edge-secret)" }, 401);

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authError = await ensureEdgeSecret(req, supabase);
    if (authError) return authError;

    let parsedBody: RequestPayload;
    try {
      parsedBody = await parseJsonBody<RequestPayload>(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid JSON body") {
        return json({ error: error.message }, 400);
      }
      throw error;
    }

    const maxLaws = clamp(
      sanitizeInteger(parsedBody.max_laws ?? parsedBody.limit, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAX_LAWS,
      }) ?? DEFAULT_MAX_LAWS,
      1,
      50,
    );
    const force = sanitizeBoolean(parsedBody.force);
    const dryRun = sanitizeBoolean(parsedBody.dry_run);

    const syncPayload: Record<string, unknown> = {
      force,
      max_laws: maxLaws,
    };
    if (dryRun) syncPayload.dry_run = true;

    const { data, error } = await supabase.rpc("invoke_internal_edge_function", {
      p_function_name: "sync-laws-rag",
      p_body: syncPayload,
      p_timeout_milliseconds: 300000,
    });

    if (error) {
      throw new Error(`invoke_internal_edge_function(sync-laws-rag) failed: ${error.message}`);
    }

    return json({
      ok: true,
      deprecated: true,
      migrated_to: "sync-laws-rag",
      request_id: typeof data === "number" ? data : null,
      forwarded_payload: syncPayload,
      note: "Legacy Gemini/1536 worker removed. RAG legal now uses OpenRouter Qwen embeddings (4096).",
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});