/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeCode,
  sanitizeNumberArray
} from "../_shared/inputSanitization.ts";

import { fetchBoeXml, parseBoeSyllabusXml } from "./parser.ts";

type WatchlistRow = {
  id: number;
  opposition_id: string;
  label: string;
  search_terms: string[] | null;
  exclude_terms: string[] | null;
  direct_boe_id: string | null;
  direct_xml_url: string | null;
  search_days_back: number;
  is_active: boolean;
};

type SummaryCandidate = {
  boeId: string;
  title: string;
  xmlUrl: string | null;
  htmlUrl: string | null;
  publishedAt: string | null;
  matchedBy: "summary" | "direct";
};

type RequestPayload = {
  watchlist_ids?: number[];
  dry_run?: boolean;
};

type ExistingSyllabusRow = {
  id: number;
  is_current: boolean;
};

type CurrentSyllabusRow = {
  id: number;
  boe_id: string | null;
  published_at: string | null;
  sha256: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ensureCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected)
    return json({ error: "Missing CRON_SECRET environment variable" }, 500);

  const received = req.headers.get("x-cron-secret");
  if (!received || received !== expected)
    return json({ error: "Unauthorized (x-cron-secret)" }, 401);

  return null;
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function isoFromDateKey(dateKey: string): string {
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function deriveBoeIdFromUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const boeId = parsed.searchParams.get("id");
    return sanitizeCode(boeId, 40) || null;
  } catch {
    return null;
  }
}

function matchesWatchlist(
  title: string,
  searchTerms: string[],
  excludeTerms: string[]
): boolean {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedSearchTerms = searchTerms
    .map(normalizeSearchText)
    .filter(Boolean);
  const normalizedExcludeTerms = excludeTerms
    .map(normalizeSearchText)
    .filter(Boolean);

  const hasIncludeMatch =
    normalizedSearchTerms.length === 0 ||
    normalizedSearchTerms.some((term) => normalizedTitle.includes(term));

  const hasExcludeMatch = normalizedExcludeTerms.some((term) =>
    normalizedTitle.includes(term)
  );
  return hasIncludeMatch && !hasExcludeMatch;
}

function collectSummaryItems(
  value: unknown,
  items: SummaryCandidate[],
  publishedAt: string
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSummaryItems(item, items, publishedAt);
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const boeId =
    typeof record.identificador === "string" ? record.identificador : null;
  const title = typeof record.titulo === "string" ? record.titulo : null;
  const xmlUrl = typeof record.url_xml === "string" ? record.url_xml : null;
  const htmlUrl = typeof record.url_html === "string" ? record.url_html : null;

  if (boeId && title) {
    items.push({
      boeId,
      title,
      xmlUrl,
      htmlUrl,
      publishedAt,
      matchedBy: "summary"
    });
  }

  for (const nested of Object.values(record))
    collectSummaryItems(nested, items, publishedAt);
}

async function fetchDailySummaryCandidates(
  dateKey: string
): Promise<SummaryCandidate[]> {
  const response = await fetch(
    `https://www.boe.es/datosabiertos/api/boe/sumario/${dateKey}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok)
    throw new Error(
      `BOE summary fetch failed (${response.status}) for ${dateKey}`
    );

  const payload = await response.json();
  const items: SummaryCandidate[] = [];
  collectSummaryItems(payload, items, isoFromDateKey(dateKey));
  return items;
}

function dedupeCandidates(candidates: SummaryCandidate[]): SummaryCandidate[] {
  const byBoeId = new Map<string, SummaryCandidate>();

  for (const candidate of candidates) {
    const key = candidate.boeId;
    const existing = byBoeId.get(key);
    if (!existing) {
      byBoeId.set(key, candidate);
      continue;
    }

    const existingScore = Number(
      existing.publishedAt?.replaceAll("-", "") ?? "0"
    );
    const currentScore = Number(
      candidate.publishedAt?.replaceAll("-", "") ?? "0"
    );
    if (currentScore > existingScore) {
      byBoeId.set(key, candidate);
      continue;
    }

    if (!existing.xmlUrl && candidate.xmlUrl)
      byBoeId.set(key, { ...existing, xmlUrl: candidate.xmlUrl });
  }

  return Array.from(byBoeId.values()).sort((a, b) => {
    if (a.matchedBy !== b.matchedBy) return a.matchedBy === "direct" ? -1 : 1;

    const aScore = Number(a.publishedAt?.replaceAll("-", "") ?? "0");
    const bScore = Number(b.publishedAt?.replaceAll("-", "") ?? "0");
    return bScore - aScore;
  });
}

async function getWatchlists(
  supabase: ReturnType<typeof createClient>,
  ids?: number[]
) {
  let query = supabase
    .from("opposition_watchlist")
    .select(
      "id, opposition_id, label, search_terms, exclude_terms, direct_boe_id, direct_xml_url, search_days_back, is_active"
    )
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (ids && ids.length > 0) query = query.in("id", ids);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WatchlistRow[];
}

async function discoverCandidatesForWatchlist(
  watchlist: WatchlistRow
): Promise<SummaryCandidate[]> {
  const candidates: SummaryCandidate[] = [];

  if (watchlist.direct_boe_id || watchlist.direct_xml_url) {
    const boeId =
      watchlist.direct_boe_id ?? deriveBoeIdFromUrl(watchlist.direct_xml_url);
    if (boeId) {
      candidates.push({
        boeId,
        title: watchlist.label,
        xmlUrl: watchlist.direct_xml_url,
        htmlUrl: boeId
          ? `https://www.boe.es/diario_boe/txt.php?id=${encodeURIComponent(boeId)}`
          : null,
        publishedAt: null,
        matchedBy: "direct"
      });
    }
  }

  const daysBack = Math.max(1, watchlist.search_days_back || 7);
  const searchTerms = watchlist.search_terms ?? [];
  const excludeTerms = watchlist.exclude_terms ?? [];

  for (let offset = 0; offset < daysBack; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const dateKey = toDateKey(date);

    let dayCandidates: SummaryCandidate[] = [];
    try {
      dayCandidates = await fetchDailySummaryCandidates(dateKey);
    } catch (error) {
      console.warn(
        JSON.stringify({
          msg: "summary_fetch_failed",
          watchlist_id: watchlist.id,
          date_key: dateKey,
          error: error instanceof Error ? error.message : String(error)
        })
      );
      continue;
    }

    for (const candidate of dayCandidates) {
      if (!matchesWatchlist(candidate.title, searchTerms, excludeTerms))
        continue;
      candidates.push(candidate);
    }
  }

  return dedupeCandidates(candidates);
}

async function findExistingSyllabus(
  supabase: ReturnType<typeof createClient>,
  oppositionId: string,
  sourceHash: string
): Promise<ExistingSyllabusRow | null> {
  const { data, error } = await supabase
    .from("opposition_syllabi")
    .select("id, is_current")
    .eq("opposition_id", oppositionId)
    .eq("sha256", sourceHash)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ExistingSyllabusRow | null) ?? null;
}

async function getCurrentSyllabus(
  supabase: ReturnType<typeof createClient>,
  oppositionId: string
): Promise<CurrentSyllabusRow | null> {
  const { data, error } = await supabase
    .from("opposition_syllabi")
    .select("id, boe_id, published_at, sha256")
    .eq("opposition_id", oppositionId)
    .eq("is_current", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CurrentSyllabusRow | null) ?? null;
}

function comparePublishedAt(
  candidatePublishedAt: string | null,
  currentPublishedAt: string | null
): number {
  if (candidatePublishedAt && currentPublishedAt)
    return candidatePublishedAt.localeCompare(currentPublishedAt);

  if (candidatePublishedAt) return 1;
  if (currentPublishedAt) return -1;
  return 0;
}

function shouldPromoteCandidate(
  candidate: SummaryCandidate,
  parsedPublishedAt: string | null,
  currentSyllabus: CurrentSyllabusRow | null
): boolean {
  if (!currentSyllabus) return true;

  if (currentSyllabus.boe_id === candidate.boeId) return false;

  const publishedAtComparison = comparePublishedAt(
    parsedPublishedAt,
    currentSyllabus.published_at
  );
  if (publishedAtComparison > 0) return true;
  if (publishedAtComparison < 0) return false;

  return false;
}

async function setCurrentSyllabus(
  supabase: ReturnType<typeof createClient>,
  syllabusId: number,
  oppositionId: string
): Promise<void> {
  const rpc = await supabase.rpc("set_current_opposition_syllabus", {
    p_syllabus_id: syllabusId
  });
  if (!rpc.error) return;

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

async function enqueueReindexJob(
  supabase: ReturnType<typeof createClient>,
  oppositionId: string,
  syllabusId: number,
  reason: string
): Promise<void> {
  const { error } = await supabase.from("rag_reindex_jobs").insert({
    source_type: "syllabus",
    opposition_id: oppositionId,
    syllabus_id: syllabusId,
    status: "pending",
    reason
  });
  if (error) throw error;
}

async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  watchlist: WatchlistRow,
  candidate: SummaryCandidate,
  currentSyllabus: CurrentSyllabusRow | null,
  dryRun: boolean
) {
  const xmlText = await fetchBoeXml(candidate.boeId, candidate.xmlUrl);
  const parsed = await parseBoeSyllabusXml(xmlText);
  const parsedPublishedAt = parsed.publishedAt ?? candidate.publishedAt;
  const shouldBeCurrent = shouldPromoteCandidate(
    candidate,
    parsedPublishedAt,
    currentSyllabus
  );

  console.log(
    JSON.stringify({
      msg: "candidate_parsed",
      watchlist_id: watchlist.id,
      opposition_id: watchlist.opposition_id,
      boe_id: candidate.boeId,
      hash: parsed.sourceHash,
      start_line_idx: parsed.startLineIdx,
      end_line_idx: parsed.endLineIdx,
      num_temas_detectados: parsed.numThemesDetected
    })
  );

  const existing = await findExistingSyllabus(
    supabase,
    watchlist.opposition_id,
    parsed.sourceHash
  );
  if (existing) {
    if (!dryRun && shouldBeCurrent && !existing.is_current)
      await setCurrentSyllabus(supabase, existing.id, watchlist.opposition_id);

    return {
      status: "no_change",
      boe_id: candidate.boeId,
      hash: parsed.sourceHash,
      syllabus_id: existing.id,
      published_at: parsedPublishedAt,
      topics_count: parsed.topics.length,
      subtopics_count: parsed.subtopics.length,
      current_applied: shouldBeCurrent
    };
  }

  if (dryRun) {
    return {
      status: "would_insert",
      boe_id: candidate.boeId,
      hash: parsed.sourceHash,
      published_at: parsedPublishedAt,
      topics_count: parsed.topics.length,
      subtopics_count: parsed.subtopics.length,
      current_applied: shouldBeCurrent
    };
  }

  let syllabusId: number | null = null;

  try {
    const { data: syllabusData, error: syllabusError } = await supabase
      .from("opposition_syllabi")
      .insert({
        opposition_id: watchlist.opposition_id,
        boe_id: candidate.boeId,
        source_url:
          candidate.xmlUrl ??
          `https://www.boe.es/diario_boe/xml.php?id=${encodeURIComponent(candidate.boeId)}`,
        published_at: parsedPublishedAt,
        sha256: parsed.sourceHash,
        raw_text: parsed.rawText,
        is_current: shouldBeCurrent
      })
      .select("id")
      .single();

    if (syllabusError) throw syllabusError;
    syllabusId = syllabusData.id as number;

    const topicRows = parsed.topics.map((topic) => ({
      syllabus_id: syllabusId,
      opposition_id: watchlist.opposition_id,
      topic_code: topic.topic_code,
      topic_title: topic.topic_title,
      order_index: topic.order_index
    }));

    const { data: insertedTopics, error: topicsError } = await supabase
      .from("opposition_topics")
      .insert(topicRows)
      .select("id, topic_code");
    if (topicsError) throw topicsError;

    const topicIdByCode = new Map<string, number>();
    for (const row of insertedTopics ?? [])
      topicIdByCode.set(String(row.topic_code), Number(row.id));

    if (topicIdByCode.size !== topicRows.length)
      throw new Error(
        "No se pudieron mapear todos los opposition_topics insertados."
      );

    const subtopicRows = parsed.subtopics.map((subtopic) => ({
      syllabus_id: syllabusId,
      opposition_topic_id: topicIdByCode.get(subtopic.parent_topic_code),
      subtopic_code: subtopic.subtopic_code,
      topic_number: subtopic.topic_number,
      subtopic_title: subtopic.subtopic_title,
      section_title: subtopic.section_title,
      order_index: subtopic.order_index
    }));

    const { error: subtopicsError } = await supabase
      .from("opposition_subtopics")
      .insert(subtopicRows);
    if (subtopicsError) throw subtopicsError;

    if (shouldBeCurrent)
      await setCurrentSyllabus(supabase, syllabusId, watchlist.opposition_id);

    await enqueueReindexJob(
      supabase,
      watchlist.opposition_id,
      syllabusId,
      shouldBeCurrent ? "syllabus-updated" : "syllabus-backfill"
    );

    return {
      status: "inserted",
      boe_id: candidate.boeId,
      hash: parsed.sourceHash,
      syllabus_id: syllabusId,
      published_at: parsedPublishedAt,
      topics_count: parsed.topics.length,
      subtopics_count: parsed.subtopics.length,
      current_applied: shouldBeCurrent
    };
  } catch (error) {
    if (syllabusId !== null) {
      const { error: cleanupError } = await supabase
        .from("opposition_syllabi")
        .delete()
        .eq("id", syllabusId);
      if (cleanupError) {
        console.error(
          JSON.stringify({
            msg: "rollback_failed",
            watchlist_id: watchlist.id,
            syllabus_id: syllabusId,
            error: cleanupError.message
          })
        );
      }
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authError = ensureCronSecret(req);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey)
    return json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500
    );

  let payload: RequestPayload = {};
  try {
    const parsed = await parseJsonBody<RequestPayload>(req);
    payload = {
      watchlist_ids: sanitizeNumberArray(parsed.watchlist_ids, {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        maxItems: 100
      }),
      dry_run: sanitizeBoolean(parsed.dry_run)
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const watchlists = await getWatchlists(supabase, payload.watchlist_ids);
    const watchlistResults: Array<Record<string, unknown>> = [];

    for (const watchlist of watchlists) {
      const candidates = await discoverCandidatesForWatchlist(watchlist);
      let currentSyllabus = await getCurrentSyllabus(
        supabase,
        watchlist.opposition_id
      );

      console.log(
        JSON.stringify({
          msg: "watchlist_candidates",
          watchlist_id: watchlist.id,
          opposition_id: watchlist.opposition_id,
          label: watchlist.label,
          candidates_found: candidates.length,
          boe_ids: candidates.map((candidate) => candidate.boeId)
        })
      );

      const processed: Array<Record<string, unknown>> = [];

      for (const candidate of candidates) {
        try {
          const result = await processCandidate(
            supabase,
            watchlist,
            candidate,
            currentSyllabus,
            Boolean(payload.dry_run)
          );

          if (
            result.current_applied === true &&
            typeof result.syllabus_id === "number"
          ) {
            currentSyllabus = {
              id: result.syllabus_id,
              boe_id: typeof result.boe_id === "string" ? result.boe_id : null,
              published_at:
                typeof result.published_at === "string"
                  ? result.published_at
                  : null,
              sha256: typeof result.hash === "string" ? result.hash : null
            };
          }

          console.log(
            JSON.stringify({
              msg: "watchlist_candidate_result",
              watchlist_id: watchlist.id,
              opposition_id: watchlist.opposition_id,
              result
            })
          );

          processed.push(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            JSON.stringify({
              msg: "watchlist_candidate_error",
              watchlist_id: watchlist.id,
              opposition_id: watchlist.opposition_id,
              boe_id: candidate.boeId,
              error: message
            })
          );
          processed.push({
            status: "error",
            boe_id: candidate.boeId,
            error: message
          });
        }
      }

      watchlistResults.push({
        watchlist_id: watchlist.id,
        opposition_id: watchlist.opposition_id,
        label: watchlist.label,
        candidates_found: candidates.length,
        processed
      });
    }

    return json({
      ok: true,
      dry_run: Boolean(payload.dry_run),
      watchlists_processed: watchlistResults.length,
      results: watchlistResults
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ msg: "sync_boe_syllabi_failed", error: message })
    );
    return json({ ok: false, error: message }, 500);
  }
});
