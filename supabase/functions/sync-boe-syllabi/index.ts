/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeCode
} from "../_shared/inputSanitization.ts";

import { fetchBoeXml } from "./parser.ts";
import { extractStructuredSyllabusFromXml } from "./structuredExtraction.ts";

/* ───────── Types ───────── */

const BOE_XML_BASE_URL = "https://www.boe.es/diario_boe/xml.php";

type RequestPayload = {
  boe_id: string;
  boe_url: string;
  opposition_id: string;
  dry_run?: boolean;
};

/* ───────── Constants ───────── */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/* ───────── Helpers ───────── */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getRuntimeSecret(
  supabase: ReturnType<typeof createServiceClient>,
  name: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_runtime_secret", {
    p_name: name
  });
  if (error)
    throw new Error(`get_runtime_secret(${name}) failed: ${error.message}`);
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function ensureAuth(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>
): Promise<Response | null> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const h = req.headers.get("x-cron-secret")?.trim();
    if (h && h === cronSecret) return null;
  }

  const edgeSecret = await getRuntimeSecret(supabase, "rag_edge_secret");
  if (edgeSecret) {
    const h = req.headers.get("x-edge-secret")?.trim();
    if (h && h === edgeSecret) return null;
  }

  return json({ error: "Unauthorized" }, 401);
}

function deriveBoeIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const boeId = parsed.searchParams.get("id");
    return sanitizeCode(boeId, 40) || null;
  } catch {
    return null;
  }
}

async function setCurrentSyllabus(
  supabase: ReturnType<typeof createClient>,
  syllabusId: number,
  oppositionId: string
): Promise<void> {
  // Try RPC first
  const rpc = await supabase.rpc("set_current_opposition_syllabus", {
    p_syllabus_id: syllabusId
  });
  if (!rpc.error) return;

  // Fallback: manual deactivate + activate
  const { error: unsetError } = await supabase
    .from("opposition_syllabi")
    .update({ is_current: false })
    .eq("opposition_id", oppositionId)
    .neq("id", syllabusId);
  if (unsetError) throw unsetError;

  const { error: setError } = await supabase
    .from("opposition_syllabi")
    .update({ is_current: true })
    .eq("id", syllabusId);
  if (setError) throw setError;
}

/* ───────── Main handler ───────── */

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createServiceClient();

  const authErr = await ensureAuth(req, supabase);
  if (authErr) return authErr;

  // Parse payload
  let payload: RequestPayload;
  try {
    const raw = await parseJsonBody<Record<string, unknown>>(req);
    const oppositionId = sanitizeCode(raw.opposition_id as string, 160);
    if (!oppositionId) return json({ error: "Missing opposition_id" }, 400);

    // Accept boe_id directly (e.g. "BOE-A-2025-27056") or boe_url
    let boeId: string | null = null;
    let boeUrl = "";
    const rawBoeId = typeof raw.boe_id === "string" ? raw.boe_id.trim() : "";
    const rawBoeUrl = typeof raw.boe_url === "string" ? raw.boe_url.trim() : "";

    if (rawBoeId) {
      boeId = sanitizeCode(rawBoeId, 40) || null;
      boeUrl = `${BOE_XML_BASE_URL}?id=${rawBoeId}`;
    } else if (rawBoeUrl) {
      boeId = deriveBoeIdFromUrl(rawBoeUrl);
      boeUrl = rawBoeUrl;
    }

    if (!boeId) return json({ error: "Missing boe_id or boe_url" }, 400);

    payload = {
      boe_id: boeId,
      boe_url: boeUrl,
      opposition_id: oppositionId,
      dry_run: sanitizeBoolean(raw.dry_run)
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid JSON body")
      return json({ error: err.message }, 400);
    throw err;
  }

  try {
    const boeId = payload.boe_id;

    const dryRun = Boolean(payload.dry_run);

    console.log(
      JSON.stringify({
        msg: "sync_start",
        boe_id: boeId,
        opposition_id: payload.opposition_id,
        dry_run: dryRun
      })
    );

    // 1. Verify opposition exists
    const { count: oppCount, error: oppError } = await supabase
      .from("oppositions")
      .select("id", { count: "exact", head: true })
      .eq("id", payload.opposition_id);
    if (oppError) throw oppError;
    if (!oppCount || oppCount === 0)
      return json(
        { error: `Opposition not found: ${payload.opposition_id}` },
        404
      );

    // 2. Fetch and parse BOE XML
    const xmlText = await fetchBoeXml(boeId, payload.boe_url);

    const parsed = await extractStructuredSyllabusFromXml({
      supabase,
      xmlText,
      boeId,
      oppositionId: payload.opposition_id,
      watchlistLabel: payload.opposition_id,
      candidateTitle: ""
    });

    console.log(
      JSON.stringify({
        msg: "extraction_complete",
        boe_id: boeId,
        opposition_id: payload.opposition_id,
        document_title: parsed.documentTitle,
        topics_count: parsed.topics.length,
        subtopics_count: parsed.subtopics.length,
        test_exam_count: parsed.testExamConfigs.length,
        has_primary_test: parsed.primaryTestExamConfig !== null,
        extraction_provider: parsed.extractionProvider,
        source_hash: parsed.sourceHash
      })
    );

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        boe_id: boeId,
        opposition_id: payload.opposition_id,
        document_title: parsed.documentTitle,
        published_at: parsed.publishedAt,
        source_hash: parsed.sourceHash,
        topics_count: parsed.topics.length,
        subtopics_count: parsed.subtopics.length,
        test_exam_configs: parsed.testExamConfigs,
        primary_test_exam_config: parsed.primaryTestExamConfig,
        extraction_provider: parsed.extractionProvider,
        extraction_model: parsed.extractionModel,
        extraction_notes: parsed.extractionNotes,
        topics: parsed.topics,
        subtopics: parsed.subtopics.map((s) => ({
          parent_topic_code: s.parent_topic_code,
          subtopic_code: s.subtopic_code,
          topic_number: s.topic_number,
          subtopic_title: s.subtopic_title
        }))
      });
    }

    // 3. Insert new syllabus (always creates a new record)
    let syllabusId: number | null = null;

    try {
      const { data: syllabusData, error: syllabusError } = await supabase
        .from("opposition_syllabi")
        .insert({
          opposition_id: payload.opposition_id,
          boe_id: boeId,
          source_url: payload.boe_url,
          document_title: parsed.documentTitle,
          published_at: parsed.publishedAt,
          sha256: parsed.sourceHash,
          raw_text: parsed.rawText,
          is_current: false, // activate after all inserts succeed
          extraction_provider: parsed.extractionProvider,
          extraction_model: parsed.extractionModel,
          extraction_notes: parsed.extractionNotes
        })
        .select("id")
        .single();

      if (syllabusError) throw syllabusError;
      syllabusId = syllabusData.id as number;

      // 5. Insert topics
      const topicRows = parsed.topics.map((t) => ({
        syllabus_id: syllabusId,
        opposition_id: payload.opposition_id,
        topic_code: t.topic_code,
        topic_title: t.topic_title,
        order_index: t.order_index
      }));

      const { data: insertedTopics, error: topicsErr } = await supabase
        .from("opposition_topics")
        .insert(topicRows)
        .select("id, topic_code");
      if (topicsErr) throw topicsErr;

      const topicIdByCode = new Map<string, number>();
      for (const row of insertedTopics ?? [])
        topicIdByCode.set(String(row.topic_code), Number(row.id));

      if (topicIdByCode.size !== topicRows.length)
        throw new Error(
          "No se pudieron mapear todos los opposition_topics insertados."
        );

      // 6. Insert subtopics
      const subtopicRows = parsed.subtopics.map((s) => ({
        syllabus_id: syllabusId,
        opposition_topic_id: topicIdByCode.get(s.parent_topic_code),
        subtopic_code: s.subtopic_code,
        topic_number: s.topic_number,
        subtopic_title: s.subtopic_title,
        section_title: s.section_title,
        order_index: s.order_index
      }));

      const { error: subErr } = await supabase
        .from("opposition_subtopics")
        .insert(subtopicRows);
      if (subErr) throw subErr;

      // 7. Insert test exam config (primary only)
      const primary = parsed.primaryTestExamConfig;
      if (primary) {
        const { error: examErr } = await supabase
          .from("opposition_test_exam_configs")
          .insert({
            syllabus_id: syllabusId,
            opposition_id: payload.opposition_id,
            exercise_label: primary.exerciseLabel,
            system_scope: primary.systemScope,
            question_count: primary.questionCount,
            options_count: primary.optionsCount,
            correct_answer_value: primary.correctAnswerValue,
            wrong_answer_penalty: primary.wrongAnswerPenalty,
            blank_answer_penalty: primary.blankAnswerPenalty,
            score_min: primary.scoreMin,
            score_max: primary.scoreMax,
            passing_score: primary.passingScore,
            duration_minutes: primary.durationMinutes,
            notes: primary.notes,
            source_excerpt: primary.sourceExcerpt
          });
        if (examErr) throw examErr;
      }

      // 8. Deactivate old syllabus and activate new one
      await setCurrentSyllabus(supabase, syllabusId, payload.opposition_id);

      console.log(
        JSON.stringify({
          msg: "sync_complete",
          boe_id: boeId,
          opposition_id: payload.opposition_id,
          syllabus_id: syllabusId,
          topics_count: parsed.topics.length,
          subtopics_count: parsed.subtopics.length,
          test_exam_count: parsed.testExamConfigs.length
        })
      );

      return json({
        ok: true,
        action: "inserted",
        boe_id: boeId,
        opposition_id: payload.opposition_id,
        syllabus_id: syllabusId,
        document_title: parsed.documentTitle,
        published_at: parsed.publishedAt,
        source_hash: parsed.sourceHash,
        topics_count: parsed.topics.length,
        subtopics_count: parsed.subtopics.length,
        has_test_exam_config: parsed.primaryTestExamConfig !== null,
        extraction_provider: parsed.extractionProvider,
        extraction_model: parsed.extractionModel
      });
    } catch (error) {
      // Rollback: delete partially inserted syllabus
      if (syllabusId !== null) {
        const { error: cleanupErr } = await supabase
          .from("opposition_syllabi")
          .delete()
          .eq("id", syllabusId);
        if (cleanupErr) {
          console.error(
            JSON.stringify({
              msg: "rollback_failed",
              opposition_id: payload.opposition_id,
              syllabus_id: syllabusId,
              error: cleanupErr.message
            })
          );
        }
      }
      throw error;
    }
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as Record<string, unknown>).message)
          : JSON.stringify(err);
    console.error(
      JSON.stringify({
        msg: "sync_boe_syllabi_failed",
        error: errMsg,
        raw: typeof err === "object" ? JSON.stringify(err) : String(err)
      })
    );
    return json({ ok: false, error: errMsg }, 500);
  }
});
