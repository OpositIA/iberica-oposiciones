/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeNumberArray
} from "../_shared/inputSanitization.ts";
import { fetchBoeXml } from "../sync-boe-syllabi/parser.ts";
import { extractStructuredSyllabusFromXml } from "../sync-boe-syllabi/structuredExtraction.ts";

/* ───────── Types ───────── */

type WatchlistRow = {
  id: number;
  opposition_id: string;
  label: string;
  search_terms: string[];
};

type SummaryItem = {
  boeId: string;
  title: string;
  xmlUrl: string | null;
  htmlUrl: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  departmentName: string | null;
  epigraphName: string | null;
};

type MatchedItem = SummaryItem & {
  watchlistId: number;
  oppositionId: string;
  watchlistLabel: string;
};

type PublicationType =
  | "convocatoria"
  | "bases"
  | "temario"
  | "plazas"
  | "correccion"
  | "nombramiento"
  | "plazo"
  | "other";

type ProcessResult = {
  boe_id: string;
  title: string;
  opposition_id: string;
  watchlist_label: string;
  section: string | null;
  department: string | null;
  epigraph: string | null;
  publication_type: PublicationType;
  has_syllabus: boolean;
  syllabus_changed: boolean;
  syllabus_id: number | null;
  action:
    | "inserted"
    | "syllabus_updated"
    | "no_change"
    | "already_known"
    | "would_insert"
    | "error";
  topics_count: number;
  subtopics_count: number;
  test_exam_count: number;
  error?: string;
};

type RequestPayload = {
  date?: string;
  dry_run?: boolean;
  watchlist_ids?: number[];
};

type SummaryContext = {
  sectionCode: string | null;
  sectionName: string | null;
  departmentName: string | null;
  epigraphName: string | null;
};

/* ───────── Constants ───────── */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-edge-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/* ───────── Helpers ───────── */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isoFromDateKey(dk: string): string {
  return `${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`;
}

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

/* ───────── Classification ───────── */

function classifyPublication(title: string): PublicationType {
  const n = normalizeSearchText(title);
  if (n.includes("correccion de errores")) return "correccion";
  if (n.includes("nombramiento")) return "nombramiento";
  if (
    n.includes("convocatoria") ||
    n.includes("se convoca") ||
    n.includes("convocando")
  )
    return "convocatoria";
  if (n.includes("bases")) return "bases";
  if (n.includes("temario") || n.includes("programa")) return "temario";
  if (n.includes("plazas") || n.includes("numero de plazas")) return "plazas";
  if (n.includes("plazo") || n.includes("ampliacion")) return "plazo";
  return "other";
}

/* ───────── BOE Summary ───────── */

function collectItems(
  value: unknown,
  out: SummaryItem[],
  ctx: SummaryContext,
  parentKey?: string
): void {
  if (Array.isArray(value)) {
    for (const v of value) collectItems(v, out, ctx, parentKey);
    return;
  }
  if (!value || typeof value !== "object") return;

  const r = value as Record<string, unknown>;
  const c = { ...ctx };
  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : null;
  const codigo = typeof r.codigo === "string" ? r.codigo.trim() : null;

  if (nombre && parentKey === "seccion") {
    c.sectionCode = codigo || c.sectionCode;
    c.sectionName = nombre;
    c.departmentName = null;
    c.epigraphName = null;
  } else if (nombre && parentKey === "departamento") {
    c.departmentName = nombre;
    c.epigraphName = null;
  } else if (nombre && parentKey === "epigrafe") {
    c.epigraphName = nombre;
  }

  const boeId = typeof r.identificador === "string" ? r.identificador : null;
  const titulo = typeof r.titulo === "string" ? r.titulo : null;

  if (boeId && titulo) {
    out.push({
      boeId,
      title: titulo,
      xmlUrl: typeof r.url_xml === "string" ? r.url_xml : null,
      htmlUrl: typeof r.url_html === "string" ? r.url_html : null,
      sectionCode: c.sectionCode,
      sectionName: c.sectionName,
      departmentName: c.departmentName,
      epigraphName: c.epigraphName
    });
  }

  for (const [k, child] of Object.entries(r)) {
    if (k === ":@") continue;
    collectItems(child, out, c, k);
  }
}

async function fetchSummary(dateKey: string): Promise<SummaryItem[]> {
  const res = await fetch(
    `https://www.boe.es/datosabiertos/api/boe/sumario/${dateKey}`,
    { headers: { Accept: "application/json" } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`BOE summary ${res.status} for ${dateKey}`);

  const payload = await res.json();
  const items: SummaryItem[] = [];
  collectItems(payload, items, {
    sectionCode: null,
    sectionName: null,
    departmentName: null,
    epigraphName: null
  });
  return items;
}

/* ───────── Section filtering ───────── */

/**
 * Only match items from relevant BOE sections:
 *   I   – Disposiciones generales
 *   II  – Autoridades y personal (includes 2B Oposiciones y concursos)
 *   III – Otras disposiciones
 *
 * Exclude:
 *   IV  – Administración de Justicia
 *   V   – Anuncios (licitaciones, contratos, etc.)
 *   BOE-B ids are always section V → always excluded
 */
function isRelevantSection(item: SummaryItem): boolean {
  // BOE-B items are always section V (Anuncios) — never relevant
  if (item.boeId.startsWith("BOE-B")) return false;

  // If we have a section name, check it starts with I, II, or III
  if (item.sectionName) {
    const s = item.sectionName.trim();
    if (
      s.startsWith("I.") ||
      s.startsWith("II.") ||
      s.startsWith("III.") ||
      s.startsWith("I ") ||
      s.startsWith("II ") ||
      s.startsWith("III ")
    )
      return true;
    // Explicitly exclude IV and V
    if (
      s.startsWith("IV") ||
      s.startsWith("V") ||
      s.startsWith("4") ||
      s.startsWith("5")
    )
      return false;
  }

  // BOE-A without recognized section — allow (conservative)
  return !item.boeId.startsWith("BOE-B");
}

/* ───────── Matching & Disambiguation ───────── */

function isRelevantOposicionesSection(item: SummaryItem): boolean {
  if (item.boeId.startsWith("BOE-B")) return false;

  const sectionCode = (item.sectionCode ?? "").trim().toUpperCase();
  if (sectionCode === "2B") return true;

  return normalizeSearchText(item.sectionName ?? "").includes(
    "oposiciones y concursos"
  );
}

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "en",
  "por",
  "para",
  "con",
  "que",
  "una",
  "uno",
  "unos",
  "unas",
  "al",
  "se",
  "su",
  "sus",
  "como",
  "mas",
  "este",
  "esta",
  "estos",
  "estas",
  "ese",
  "esa",
  "esos",
  "esas"
]);

function labelRelevanceScore(title: string, label: string): number {
  const normalizedTitle = normalizeSearchText(title);
  const words = normalizeSearchText(label)
    .split(" ")
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  if (words.length === 0) return 0;
  return words.filter((w) => normalizedTitle.includes(w)).length / words.length;
}

function disambiguateMatches(matches: MatchedItem[]): MatchedItem[] {
  const byBoeId = new Map<string, MatchedItem[]>();
  for (const m of matches) {
    const group = byBoeId.get(m.boeId) ?? [];
    group.push(m);
    byBoeId.set(m.boeId, group);
  }

  const result: MatchedItem[] = [];
  for (const group of byBoeId.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const scored = group.map((m) => ({
      match: m,
      score: labelRelevanceScore(m.title, m.watchlistLabel)
    }));
    scored.sort((a, b) => b.score - a.score);
    const bestScore = scored[0].score;

    if (bestScore > 0) {
      for (const { match, score } of scored) {
        if (score >= bestScore) result.push(match);
      }
    } else {
      for (const { match } of scored) result.push(match);
    }
  }

  return result;
}

function matchItems(
  items: SummaryItem[],
  watchlists: WatchlistRow[]
): MatchedItem[] {
  const rawMatches: MatchedItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!isRelevantOposicionesSection(item)) continue;

    const normalizedTitle = normalizeSearchText(item.title);
    for (const wl of watchlists) {
      const terms = (wl.search_terms ?? [])
        .map(normalizeSearchText)
        .filter(Boolean);
      if (terms.length === 0) continue;
      if (!terms.some((t) => normalizedTitle.includes(t))) continue;

      const key = `${item.boeId}:${wl.opposition_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rawMatches.push({
        ...item,
        watchlistId: wl.id,
        oppositionId: wl.opposition_id,
        watchlistLabel: wl.label
      });
    }
  }

  return disambiguateMatches(rawMatches);
}

/* ───────── DB helpers ───────── */

async function getWatchlists(
  sb: ReturnType<typeof createClient>,
  ids?: number[]
): Promise<WatchlistRow[]> {
  let q = sb
    .from("opposition_watchlist")
    .select("id, opposition_id, label, search_terms")
    .eq("is_active", true)
    .order("id");

  if (ids && ids.length > 0) q = q.in("id", ids);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WatchlistRow[];
}

async function alreadyRecorded(
  sb: ReturnType<typeof createClient>,
  boeId: string,
  oppositionId: string
): Promise<boolean> {
  const { count, error } = await sb
    .from("boe_daily_publications")
    .select("id", { count: "exact", head: true })
    .eq("boe_id", boeId)
    .eq("opposition_id", oppositionId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function getCurrentSyllabus(
  sb: ReturnType<typeof createClient>,
  oppositionId: string
) {
  const { data, error } = await sb
    .from("opposition_syllabi")
    .select("id, boe_id, published_at, sha256")
    .eq("opposition_id", oppositionId)
    .eq("is_current", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: number;
    boe_id: string | null;
    published_at: string | null;
    sha256: string | null;
  } | null;
}

async function recordPublication(
  sb: ReturnType<typeof createClient>,
  match: MatchedItem,
  pubType: PublicationType,
  hasSyllabus: boolean,
  syllabusChanged: boolean,
  syllabusId: number | null,
  publishedAt: string | null,
  details: Record<string, unknown>
): Promise<void> {
  const { error } = await sb.from("boe_daily_publications").insert({
    boe_id: match.boeId,
    watchlist_id: match.watchlistId,
    opposition_id: match.oppositionId,
    title: match.title,
    section_name: match.sectionName,
    department_name: match.departmentName,
    epigraph_name: match.epigraphName,
    xml_url: match.xmlUrl,
    html_url: match.htmlUrl,
    published_at: publishedAt,
    publication_type: pubType,
    has_syllabus: hasSyllabus,
    syllabus_changed: syllabusChanged,
    syllabus_id: syllabusId,
    detection_details: details,
    processed_at: new Date().toISOString()
  });
  if (error) throw error;
}

/* ───────── Syllabus insertion ───────── */

async function insertNewSyllabus(
  sb: ReturnType<typeof createClient>,
  oppositionId: string,
  boeId: string,
  xmlUrl: string | null,
  parsed: Awaited<ReturnType<typeof extractStructuredSyllabusFromXml>>,
  publishedAt: string | null,
  shouldBeCurrent: boolean
): Promise<number> {
  let syllabusId: number | null = null;

  try {
    const { data, error } = await sb
      .from("opposition_syllabi")
      .insert({
        opposition_id: oppositionId,
        boe_id: boeId,
        source_url:
          xmlUrl ??
          `https://www.boe.es/diario_boe/xml.php?id=${encodeURIComponent(boeId)}`,
        document_title: parsed.documentTitle,
        published_at: publishedAt,
        sha256: parsed.sourceHash,
        raw_text: parsed.rawText,
        is_current: shouldBeCurrent,
        extraction_provider: parsed.extractionProvider,
        extraction_model: parsed.extractionModel,
        extraction_notes: parsed.extractionNotes
      })
      .select("id")
      .single();
    if (error) throw error;
    syllabusId = data.id as number;

    const topicRows = parsed.topics.map((t) => ({
      syllabus_id: syllabusId,
      opposition_id: oppositionId,
      topic_code: t.topic_code,
      topic_title: t.topic_title,
      order_index: t.order_index
    }));

    const { data: insertedTopics, error: topicsErr } = await sb
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

    const subtopicRows = parsed.subtopics.map((s) => ({
      syllabus_id: syllabusId,
      opposition_topic_id: topicIdByCode.get(s.parent_topic_code),
      subtopic_code: s.subtopic_code,
      topic_number: s.topic_number,
      subtopic_title: s.subtopic_title,
      section_title: s.section_title,
      order_index: s.order_index
    }));

    const { error: subErr } = await sb
      .from("opposition_subtopics")
      .insert(subtopicRows);
    if (subErr) throw subErr;

    // Insert test exam config (primary only)
    const primary = parsed.primaryTestExamConfig;
    if (primary) {
      const { error: examErr } = await sb
        .from("opposition_test_exam_configs")
        .insert({
          syllabus_id: syllabusId,
          opposition_id: oppositionId,
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

    return syllabusId;
  } catch (error) {
    if (syllabusId !== null) {
      const { error: cleanupErr } = await sb
        .from("opposition_syllabi")
        .delete()
        .eq("id", syllabusId);
      if (cleanupErr) {
        console.error(
          JSON.stringify({
            msg: "rollback_failed",
            opposition_id: oppositionId,
            syllabus_id: syllabusId,
            error: cleanupErr.message
          })
        );
      }
    }
    throw error;
  }
}

/* ───────── Process a single matched item ───────── */

async function processMatch(
  sb: ReturnType<typeof createClient>,
  match: MatchedItem,
  publishedAt: string | null,
  dryRun: boolean
): Promise<ProcessResult> {
  const pubType = classifyPublication(match.title);

  const base: Omit<ProcessResult, "action"> = {
    boe_id: match.boeId,
    title: match.title,
    opposition_id: match.oppositionId,
    watchlist_label: match.watchlistLabel,
    section: match.sectionName,
    department: match.departmentName,
    epigraph: match.epigraphName,
    publication_type: pubType,
    has_syllabus: false,
    syllabus_changed: false,
    syllabus_id: null,
    topics_count: 0,
    subtopics_count: 0,
    test_exam_count: 0
  };

  // Skip if already recorded
  if (!dryRun) {
    const exists = await alreadyRecorded(sb, match.boeId, match.oppositionId);
    if (exists) return { ...base, action: "already_known" };
  }

  // Fetch individual XML
  let xmlText: string;
  try {
    xmlText = await fetchBoeXml(match.boeId, match.xmlUrl);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ...base, action: "error", error: `xml_fetch: ${errMsg}` };
  }

  // Try to extract syllabus (ANEXO I)
  let parsed: Awaited<
    ReturnType<typeof extractStructuredSyllabusFromXml>
  > | null = null;
  try {
    parsed = await extractStructuredSyllabusFromXml({
      supabase: sb,
      xmlText,
      boeId: match.boeId,
      oppositionId: match.oppositionId,
      watchlistLabel: match.watchlistLabel,
      candidateTitle: match.title
    });
    base.has_syllabus = true;
    base.topics_count = parsed.topics.length;
    base.subtopics_count = parsed.subtopics.length;
    base.test_exam_count = parsed.testExamConfigs.length;
  } catch {
    // No ANEXO I — normal for non-syllabus publications
    parsed = null;
  }

  // If syllabus found, compare with existing
  if (parsed) {
    const current = await getCurrentSyllabus(sb, match.oppositionId);
    const syllabusPublishedAt = parsed.publishedAt ?? publishedAt;

    // Determine if this syllabus should become the current one
    let shouldBeCurrent = true;
    if (current) {
      if (current.boe_id === match.boeId) {
        shouldBeCurrent = false;
      } else if (syllabusPublishedAt && current.published_at) {
        shouldBeCurrent =
          syllabusPublishedAt.localeCompare(current.published_at) > 0;
      }
    }

    // Check if same hash already exists
    const { data: existingByHash } = await sb
      .from("opposition_syllabi")
      .select("id, is_current")
      .eq("opposition_id", match.oppositionId)
      .eq("sha256", parsed.sourceHash)
      .limit(1)
      .maybeSingle();

    if (existingByHash) {
      base.syllabus_id = existingByHash.id;
      base.syllabus_changed = false;

      if (!dryRun && shouldBeCurrent && !existingByHash.is_current) {
        const { error: deactivateError } = await sb
          .from("opposition_syllabi")
          .update({ is_current: false })
          .eq("opposition_id", match.oppositionId)
          .neq("id", existingByHash.id);
        if (deactivateError) throw deactivateError;

        const { error: activateError } = await sb
          .from("opposition_syllabi")
          .update({ is_current: true })
          .eq("id", existingByHash.id);
        if (activateError) throw activateError;
      }

      if (!dryRun) {
        await recordPublication(
          sb,
          match,
          pubType,
          true,
          false,
          existingByHash.id,
          publishedAt,
          {
            existing_syllabus_hash: parsed.sourceHash,
            test_exam_count: parsed.testExamConfigs.length
          }
        );
      }
      return { ...base, action: "no_change" };
    }

    // New syllabus detected
    base.syllabus_changed = true;

    if (dryRun) return { ...base, action: "would_insert" };

    const syllabusId = await insertNewSyllabus(
      sb,
      match.oppositionId,
      match.boeId,
      match.xmlUrl,
      parsed,
      syllabusPublishedAt,
      shouldBeCurrent
    );
    base.syllabus_id = syllabusId;

    await recordPublication(
      sb,
      match,
      pubType,
      true,
      true,
      syllabusId,
      publishedAt,
      {
        syllabus_hash: parsed.sourceHash,
        is_current: shouldBeCurrent,
        previous_syllabus_id: current?.id ?? null,
        test_exam_count: parsed.testExamConfigs.length,
        extraction_provider: parsed.extractionProvider,
        extraction_model: parsed.extractionModel
      }
    );

    return { ...base, action: "syllabus_updated" };
  }

  // No syllabus — record the publication for tracking
  if (!dryRun) {
    await recordPublication(
      sb,
      match,
      pubType,
      false,
      false,
      null,
      publishedAt,
      {}
    );
  }

  return { ...base, action: dryRun ? "would_insert" : "inserted" };
}

/* ───────── Main handler ───────── */

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createServiceClient();

  const authErr = await ensureAuth(req, supabase);
  if (authErr) return authErr;

  let payload: RequestPayload = {};
  try {
    const raw = await parseJsonBody<RequestPayload>(req);
    payload = {
      date:
        typeof raw.date === "string"
          ? raw.date.replace(/\D/g, "").slice(0, 8)
          : undefined,
      dry_run: sanitizeBoolean(raw.dry_run),
      watchlist_ids: sanitizeNumberArray(raw.watchlist_ids, {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        maxItems: 100
      })
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid JSON body")
      return json({ error: err.message }, 400);
    throw err;
  }

  try {
    const dateKey = payload.date ?? toDateKey(new Date());
    const dateIso = isoFromDateKey(dateKey);
    const dryRun = Boolean(payload.dry_run);

    console.log(
      JSON.stringify({ msg: "scan_start", date: dateIso, dry_run: dryRun })
    );

    // 1. Fetch today's BOE summary
    const allItems = await fetchSummary(dateKey);
    if (allItems.length === 0) {
      return json({
        ok: true,
        date: dateIso,
        dry_run: dryRun,
        summary_items_total: 0,
        note: "No BOE published on this date",
        results: []
      });
    }

    // 2. Get active watchlists
    const watchlists = await getWatchlists(
      supabase,
      payload.watchlist_ids && payload.watchlist_ids.length > 0
        ? payload.watchlist_ids
        : undefined
    );
    if (watchlists.length === 0) {
      return json({
        ok: true,
        date: dateIso,
        dry_run: dryRun,
        summary_items_total: allItems.length,
        note: "No active watchlists found",
        results: []
      });
    }

    // 3. Match items against watchlists (sections I-III only)
    const relevantItems = allItems.filter(isRelevantSection);
    const matches = matchItems(relevantItems, watchlists);

    const section2bCount = allItems.filter(
      (i) =>
        i.epigraphName !== null &&
        normalizeSearchText(i.epigraphName).startsWith("b.")
    ).length;

    console.log(
      JSON.stringify({
        msg: "scan_matches",
        date: dateIso,
        summary_items_total: allItems.length,
        relevant_items: relevantItems.length,
        excluded_items: allItems.length - relevantItems.length,
        section_2b_items: section2bCount,
        matched_items: matches.length,
        matched_boe_ids: matches.map((m) => ({
          boe_id: m.boeId,
          opposition: m.oppositionId,
          section: m.sectionName,
          epigraph: m.epigraphName
        }))
      })
    );

    // 4. Process each match
    const results: ProcessResult[] = [];

    for (const match of matches) {
      try {
        const result = await processMatch(supabase, match, dateIso, dryRun);
        results.push(result);
        console.log(
          JSON.stringify({
            msg: "scan_result",
            boe_id: result.boe_id,
            opposition_id: result.opposition_id,
            publication_type: result.publication_type,
            has_syllabus: result.has_syllabus,
            syllabus_changed: result.syllabus_changed,
            action: result.action
          })
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            msg: "scan_error",
            boe_id: match.boeId,
            opposition_id: match.oppositionId,
            error: errMsg
          })
        );
        results.push({
          boe_id: match.boeId,
          title: match.title,
          opposition_id: match.oppositionId,
          watchlist_label: match.watchlistLabel,
          section: match.sectionName,
          department: match.departmentName,
          epigraph: match.epigraphName,
          publication_type: classifyPublication(match.title),
          has_syllabus: false,
          syllabus_changed: false,
          syllabus_id: null,
          action: "error",
          topics_count: 0,
          subtopics_count: 0,
          test_exam_count: 0,
          error: errMsg
        });
      }
    }

    return json({
      ok: true,
      date: dateIso,
      dry_run: dryRun,
      summary_items_total: allItems.length,
      section_2b_items: section2bCount,
      matched_items: matches.length,
      results
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ msg: "scan_boe_daily_failed", error: errMsg })
    );
    return json({ ok: false, error: errMsg }, 500);
  }
});
