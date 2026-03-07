/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeInteger,
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  limit?: number;
  max_chunks?: number;
};

type ReindexJobRow = {
  id: number;
  source_type: "law";
  rag_source_id: number | null;
  law_boe_id: string | null;
};

type RagSourceRow = {
  id: number;
  source_type: "law";
  law_boe_id: string | null;
  is_current: boolean;
};

type RagChunkRow = {
  id: number;
  content: string;
  content_hash: string;
  embedding: number[] | null;
  embedding_content_hash: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_LIMIT = 1;
const DEFAULT_MAX_CHUNKS = 12;
const EMBEDDING_MODEL = "models/gemini-embedding-001";
const EMBEDDING_DIM = 1536;

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

async function claimJobs(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<ReindexJobRow[]> {
  const { data, error } = await supabase.rpc("claim_rag_reindex_jobs", {
    p_limit: limit,
    p_source_type: "law",
  });

  if (error) throw new Error(`claim_rag_reindex_jobs failed: ${error.message}`);
  return (data ?? []) as ReindexJobRow[];
}

async function countPendingJobs(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { count, error } = await supabase
    .from("rag_reindex_jobs")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "law")
    .eq("status", "pending");

  if (error) throw new Error(`Count pending rag_reindex_jobs failed: ${error.message}`);
  return Number(count ?? 0);
}

async function enqueueNextWorkerRun(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
  maxChunks: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("invoke_internal_edge_function", {
    p_function_name: "process-rag-law-jobs",
    p_body: { limit, max_chunks: maxChunks },
    p_timeout_milliseconds: 300000,
  });

  if (error) throw new Error(`Enqueue process-rag-law-jobs failed: ${error.message}`);
  return typeof data === "number" ? data : null;
}

async function resolveTargetSource(
  supabase: ReturnType<typeof createServiceClient>,
  job: ReindexJobRow,
): Promise<RagSourceRow | null> {
  if (job.rag_source_id != null) {
    const { data, error } = await supabase
      .from("rag_sources")
      .select("id, source_type, law_boe_id, is_current")
      .eq("id", job.rag_source_id)
      .eq("source_type", "law")
      .maybeSingle();

    if (error) throw new Error(`Load rag_source ${job.rag_source_id} failed: ${error.message}`);
    return (data as RagSourceRow | null) ?? null;
  }

  if (!job.law_boe_id) return null;

  const { data, error } = await supabase
    .from("rag_sources")
    .select("id, source_type, law_boe_id, is_current")
    .eq("source_type", "law")
    .eq("law_boe_id", job.law_boe_id)
    .eq("is_current", true)
    .maybeSingle();

  if (error) throw new Error(`Load current rag_source for ${job.law_boe_id} failed: ${error.message}`);
  return (data as RagSourceRow | null) ?? null;
}

async function fetchCurrentChunks(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: number,
): Promise<RagChunkRow[]> {
  const { data, error } = await supabase
    .from("rag_chunks")
    .select("id, content, content_hash, embedding, embedding_content_hash")
    .eq("rag_source_id", sourceId)
    .eq("is_current", true)
    .order("chunk_index", { ascending: true });

  if (error) throw new Error(`Load rag_chunks for source ${sourceId} failed: ${error.message}`);
  return (data ?? []) as RagChunkRow[];
}

async function embedOne(text: string, googleApiKey: string): Promise<number[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(googleApiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: EMBEDDING_DIM,
            content: {
              parts: [{ text }],
            },
          }),
        },
      );

      if (!response.ok) 
        throw new Error(`Gemini embedding error (${response.status}): ${await response.text()}`);
      

      const payload = await response.json();
      const vector = payload?.embedding?.values ?? payload?.embedding?.value ?? payload?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) 
        throw new Error("Gemini devolvio un embedding vacio");
      
      return vector.map((value: unknown) => Number(value));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const waitMs = 1000 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw new Error(`Gemini embed fallo tras reintentos: ${lastError?.message ?? "unknown"}`);
}

async function updateChunkEmbedding(
  supabase: ReturnType<typeof createServiceClient>,
  chunkId: number,
  embedding: number[],
  contentHash: string,
): Promise<void> {
  const { error } = await supabase
    .from("rag_chunks")
    .update({
      embedding,
      embedding_content_hash: contentHash,
      embedding_provider: "gemini",
      embedding_model: EMBEDDING_MODEL,
      embedding_updated_at: new Date().toISOString(),
      embedding_error: null,
    })
    .eq("id", chunkId);

  if (error) throw new Error(`Update chunk embedding failed: ${error.message}`);
}

async function updateChunkEmbeddingError(
  supabase: ReturnType<typeof createServiceClient>,
  chunkId: number,
  errorText: string,
): Promise<void> {
  const { error } = await supabase
    .from("rag_chunks")
    .update({ embedding_error: errorText.slice(0, 2000) })
    .eq("id", chunkId);

  if (error) throw new Error(`Update chunk embedding_error failed: ${error.message}`);
}

async function updateJobStatus(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: number,
  status: "pending" | "done" | "error",
  errorText: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("rag_reindex_jobs")
    .update({
      status,
      error_text: errorText,
    })
    .eq("id", jobId);

  if (error) throw new Error(`Update rag_reindex_job failed: ${error.message}`);
}

async function processJob(
  supabase: ReturnType<typeof createServiceClient>,
  job: ReindexJobRow,
  googleApiKey: string,
  maxChunks: number,
): Promise<Record<string, unknown>> {
  const source = await resolveTargetSource(supabase, job);
  if (!source) 
    throw new Error("No se encontro rag_source para el job");
  

  const chunks = await fetchCurrentChunks(supabase, Number(source.id));
  if (chunks.length === 0) 
    throw new Error(`rag_source ${source.id} no tiene chunks vigentes`);
  

  let embeddedNow = 0;
  let unchanged = 0;
  const chunksToEmbed = chunks.filter((chunk) =>
    !(
      Array.isArray(chunk.embedding)
      && chunk.embedding.length > 0
      && chunk.embedding_content_hash
      && chunk.embedding_content_hash === chunk.content_hash
    )
  );
  const batch = chunksToEmbed.slice(0, maxChunks);
  const remainingChunks = Math.max(0, chunksToEmbed.length - batch.length);

  unchanged = chunks.length - chunksToEmbed.length;
  for (const chunk of batch) {
    try {
      const embedding = await embedOne(chunk.content, googleApiKey);
      await updateChunkEmbedding(supabase, Number(chunk.id), embedding, chunk.content_hash);
      embeddedNow += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateChunkEmbeddingError(supabase, Number(chunk.id), message);
      throw error;
    }
  }

  return {
    job_id: Number(job.id),
    rag_source_id: Number(source.id),
    source_type: "law",
    status: remainingChunks > 0 ? "pending" : "done",
    law_boe_id: source.law_boe_id,
    current_chunks: chunks.length,
    embedded_now: embeddedNow,
    unchanged_chunks: unchanged,
    remaining_chunks: remainingChunks,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authError = await ensureEdgeSecret(req, supabase);
    if (authError) return authError;

    const googleApiKey = await getRuntimeSecret(supabase, "google_api_key");
    if (!googleApiKey) 
      return json({ ok: false, error: "Missing google_api_key" }, 500);
    

    let parsedBody: RequestPayload;
    try {
      parsedBody = await parseJsonBody<RequestPayload>(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid JSON body") 
        return json({ error: error.message }, 400);
      
      throw error;
    }
    const limit = clamp(
      sanitizeInteger(parsedBody.limit, { min: 1, max: 10, fallback: DEFAULT_LIMIT }) ?? DEFAULT_LIMIT,
      1,
      10,
    );
    const maxChunks = clamp(
      sanitizeInteger(parsedBody.max_chunks, {
        min: 1,
        max: 50,
        fallback: DEFAULT_MAX_CHUNKS,
      }) ?? DEFAULT_MAX_CHUNKS,
      1,
      50,
    );
    const jobs = await claimJobs(supabase, limit);

    if (jobs.length === 0) {
      return json({
        ok: true,
        processed_jobs: 0,
        results: [],
      });
    }

    const results: Record<string, unknown>[] = [];
    for (const job of jobs) {
      try {
        const result = await processJob(supabase, job, googleApiKey, maxChunks);
        const hasRemaining = Number(result.remaining_chunks ?? 0) > 0;
        await updateJobStatus(supabase, Number(job.id), hasRemaining ? "pending" : "done", null);
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateJobStatus(supabase, Number(job.id), "error", message);
        results.push({
          job_id: Number(job.id),
          source_type: "law",
          status: "error",
          error: message,
        });
      }
    }

    const pendingJobs = await countPendingJobs(supabase);
    const nextRequestId = pendingJobs > 0
      ? await enqueueNextWorkerRun(supabase, limit, maxChunks)
      : null;

    return json({
      ok: true,
      processed_jobs: jobs.length,
      pending_jobs: pendingJobs,
      max_chunks: maxChunks,
      next_request_id: nextRequestId,
      results,
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
