import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")?.trim() || "";
const OPENROUTER_BASE_URL =
  Deno.env.get("OPENROUTER_BASE_URL")?.trim() || "https://openrouter.ai/api/v1";
const OPENROUTER_APP_URL =
  Deno.env.get("OPENROUTER_APP_URL")?.trim() || "https://opositai.com";
const OPENROUTER_APP_NAME =
  Deno.env.get("OPENROUTER_APP_NAME")?.trim() || "OpositAI";
const OPENROUTER_CHAT_MODEL =
  Deno.env.get("OPENROUTER_CHAT_MODEL")?.trim() || "qwen/qwen3-235b-a22b-2507";
const OPENROUTER_TIMEOUT_MS = Math.max(
  5000,
  Number(Deno.env.get("OPENROUTER_TIMEOUT_MS") ?? "20000")
);

const OPENROUTER_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
const EMBEDDING_DIM = 4096;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

const LAW_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_LAW_MATCH_THRESHOLD") ?? "0.22"
);
const LAW_MATCH_COUNT = Math.max(
  8,
  Number(Deno.env.get("ASK_LAW_MATCH_COUNT") ?? "18")
);
const ARTICLE_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_ARTICLE_MATCH_THRESHOLD") ?? "0.16"
);
const ARTICLE_MATCH_COUNT = Math.max(
  8,
  Number(Deno.env.get("ASK_ARTICLE_MATCH_COUNT") ?? "18")
);
const MAX_CONTEXT_HITS = Math.max(
  6,
  Number(Deno.env.get("ASK_MAX_CONTEXT_HITS") ?? "9")
);
const MIN_GENERAL_CONTEXT_HITS = 2;
const MAX_MESSAGE_CHARS = 3000;
const MAX_HISTORY_ITEMS = 6;
const MAX_CONTEXTUAL_QUESTION_CHARS = 3500;
const MAX_TOTAL_CONTEXT_CHARS = 22000;

const REFUSAL_MESSAGE =
  "No lo encuentro en el material aportado. Para afinar la busqueda, indicame la norma, el articulo o el tema concreto.";

type HistoryLine = { role: "user" | "assistant" | "system"; text: string };
type ArticleRef = {
  raw: string;
  normalized: string;
  base: string;
  variants: string[];
};
type ArticleQuery = {
  requested: string;
  filter: string;
  mode: "exact" | "base";
  query: string;
};
type ReferenceResolution = {
  requested: ArticleRef;
  forcedHits: RetrievalHit[];
  note: string | null;
};
type RetrievalHit = {
  id: string | null;
  id_boe: string | null;
  titulo_ley: string | null;
  articulo_num: string | null;
  unit_type: string | null;
  unit_id: string | null;
  apartado_path: string | null;
  contenido: string | null;
  url_norma: string | null;
  fecha_actualizacion: string | null;
  fecha_vigencia: string | null;
  fecha_publicacion: string | null;
  eli: string | null;
  similarity: number;
  source: "buscar_ley" | "buscar_articulos";
  score: number;
  article_matches: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const safeText = (value: unknown, max = 12000) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
};

const safeCompactText = (value: unknown, max = 300) =>
  safeText(value, max)
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const normalizeAnswerText = (value: unknown, max = 12000) =>
  safeText(value, max)
    // Evita que etiquetas HTML se muestren literales en frontend markdown.
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/\s{2,}/g, " ")
    .trim();

const normalizeLooseText = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/[,\-_/]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCompactText = (value: string) =>
  normalizeLooseText(value).replace(/\s+/g, "");

const bearer = (authHeader: string | null) => {
  if (!authHeader) return "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const normalizeArticleToken = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/\bart(?:iculo)?s?\.?\s*/g, "")
    .replace(/[\u00BA\u00AA]/g, "")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z.]/g, "")
    .trim();

const extractArticleBase = (value: string) => value.match(/^\d+/)?.[0] ?? "";

const extractArticleRefs = (question: string): ArticleRef[] => {
  const refs = new Map<string, ArticleRef>();
  const regex =
    /\bart(?:iculo)?s?\.?\s*(\d+(?:[.,]\d+)?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)/gi;

  let match: RegExpExecArray | null = regex.exec(stripAccents(question));
  while (match) {
    const raw = safeText(match[1], 80);
    const normalized = normalizeArticleToken(raw);
    if (!normalized || refs.has(normalized)) {
      match = regex.exec(stripAccents(question));
      continue;
    }

    const base = extractArticleBase(normalized);
    const variants = Array.from(new Set([normalized, base].filter(Boolean)));
    refs.set(normalized, {
      raw,
      normalized,
      base,
      variants
    });
    match = regex.exec(stripAccents(question));
  }

  return Array.from(refs.values());
};

const extractBoeRefs = (question: string) => {
  const boes = question.match(/\bBOE-[A-Z]-\d{4}-\d+\b/gi) ?? [];
  return Array.from(new Set(boes.map((value) => value.toUpperCase())));
};

const inferLawAlias = (question: string) => {
  const normalized = normalizeLooseText(question);
  if (
    /\blgt\b/.test(normalized) ||
    /\bl g t\b/.test(normalized) ||
    normalized.includes("ley general tributaria")
  ) {
    return {
      boeId: "BOE-A-2003-23186",
      hint: "ley general tributaria lgt",
      label: "LGT"
    };
  }
  return null;
};

const extractHistory = (
  rawHistory: unknown,
  maxItems = MAX_HISTORY_ITEMS
): HistoryLine[] => {
  if (!Array.isArray(rawHistory)) return [];

  const lines: HistoryLine[] = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rawRole = safeText(row.role, 20).toLowerCase();
    const role: HistoryLine["role"] =
      rawRole === "assistant" || rawRole === "model"
        ? "assistant"
        : rawRole === "system"
          ? "system"
          : "user";

    const texts: string[] = [];
    if (Array.isArray(row.parts)) {
      for (const part of row.parts) {
        if (!part || typeof part !== "object") continue;
        const text = safeCompactText(
          (part as Record<string, unknown>).text,
          1500
        );
        if (text) texts.push(text);
      }
    }

    if (typeof row.content === "string") {
      const text = safeCompactText(row.content, 1500);
      if (text) texts.push(text);
    }

    if (typeof row.text === "string") {
      const text = safeCompactText(row.text, 1500);
      if (text) texts.push(text);
    }

    const merged = safeCompactText(texts.join("\n"), 1600);
    if (!merged) continue;
    lines.push({ role, text: merged });
  }

  return lines.slice(-maxItems);
};

const buildContextualQuestion = (question: string, history: HistoryLine[]) => {
  if (history.length === 0) return question;
  const historyText = history
    .slice(-4)
    .map((line) => `${line.role}: ${line.text}`)
    .join("\n");

  return safeText(
    `Contexto conversacional:\n${historyText}\n\nPregunta actual:\n${question}`,
    MAX_CONTEXTUAL_QUESTION_CHARS
  );
};

const dedupeStrings = (values: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = safeText(value, 1000);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
};

const buildRetrievalQueries = (
  question: string,
  contextualQuestion: string,
  articleRefs: ArticleRef[],
  lawHint: string
) => {
  const semanticQueries = dedupeStrings([
    question,
    contextualQuestion !== question ? contextualQuestion : "",
    lawHint ? `${question} ${lawHint}` : "",
    articleRefs.length > 0
      ? `${question} referencias ${articleRefs.map((ref) => ref.normalized).join(" ")}`
      : ""
  ]).slice(0, 4);

  const articleQueries: ArticleQuery[] = [];
  const seenArticleQueries = new Set<string>();
  for (const ref of articleRefs.slice(0, 4)) {
    for (const variant of ref.variants.slice(0, 2)) {
      const key = `${ref.normalized}|${variant}`;
      if (seenArticleQueries.has(key)) continue;
      seenArticleQueries.add(key);
      const mode: ArticleQuery["mode"] =
        variant === ref.normalized ? "exact" : "base";
      articleQueries.push({
        requested: ref.normalized,
        filter: variant,
        mode,
        query: safeText(
          [`articulo ${variant}`, lawHint, question].filter(Boolean).join(" "),
          600
        )
      });
    }
  }

  const allQueries = dedupeStrings([
    ...semanticQueries,
    ...articleQueries.map((item) => item.query)
  ]);

  return { semanticQueries, articleQueries, allQueries };
};

function extractErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;

  const direct = safeText(record.message, 500);
  if (direct) return direct;

  if (typeof record.error === "string")
    return safeText(record.error, 500) || fallback;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    const nestedMessage =
      safeText(nested.message, 500) || safeText(nested.code, 500);
    if (nestedMessage) return nestedMessage;
  }

  return fallback;
}

async function callOpenRouter(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": OPENROUTER_APP_URL,
      "X-Title": OPENROUTER_APP_NAME
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      extractErrorMessage(data, `OpenRouter error (${response.status})`)
    );

  return data;
}

const validateEmbedding = (vector: unknown, index: number) => {
  if (!Array.isArray(vector))
    throw new Error(`Embedding invalido en indice ${index}: vector ausente`);

  const numeric = vector.map((value) => Number(value));
  if (!numeric.every((value) => Number.isFinite(value)))
    throw new Error(
      `Embedding invalido en indice ${index}: contiene valores no numericos`
    );

  if (numeric.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding con dimension invalida en indice ${index}: ${numeric.length} (esperada ${EMBEDDING_DIM})`
    );
  }

  return numeric;
};

const normalizeRpcRows = (
  rows: Array<Record<string, unknown>>,
  source: "buscar_ley" | "buscar_articulos"
): RetrievalHit[] =>
  rows
    .map((row) => {
      const similarity = Number(row.similarity);
      if (!Number.isFinite(similarity)) return null;

      return {
        id: safeText(row.id, 120) || null,
        id_boe: safeText(row.id_boe, 80) || null,
        titulo_ley: safeText(row.titulo_ley, 260) || null,
        articulo_num: safeText(row.articulo_num, 140) || null,
        unit_type: safeText(row.unit_type, 80) || null,
        unit_id: safeText(row.unit_id, 120) || null,
        apartado_path: safeText(row.apartado_path, 220) || null,
        contenido: safeText(row.contenido, 6000) || null,
        url_norma: safeText(row.url_norma, 500) || null,
        fecha_actualizacion: safeText(row.fecha_actualizacion, 32) || null,
        fecha_vigencia: safeText(row.fecha_vigencia, 32) || null,
        fecha_publicacion: safeText(row.fecha_publicacion, 32) || null,
        eli: safeText(row.eli, 180) || null,
        similarity,
        source,
        score: similarity,
        article_matches: []
      } as RetrievalHit;
    })
    .filter((row): row is RetrievalHit => row !== null);

type ArticleMatchKind = "exact" | "child" | "base" | "none";

const detectArticleMatch = (
  hit: RetrievalHit,
  ref: ArticleRef
): ArticleMatchKind => {
  const article = normalizeArticleToken(hit.articulo_num ?? "");
  const unitId = normalizeCompactText(hit.unit_id ?? "");
  const path = normalizeCompactText(hit.apartado_path ?? "");
  const compactRequested = normalizeCompactText(ref.normalized);
  const compactBase = normalizeCompactText(ref.base);

  if (article && article === ref.normalized) return "exact";
  if (
    compactRequested &&
    (unitId === `a${compactRequested}` || path === `a${compactRequested}`)
  )
    return "exact";

  if (article && article.startsWith(`${ref.normalized}.`)) return "child";
  if (
    compactRequested &&
    (unitId.includes(compactRequested) || path.includes(compactRequested))
  )
    return "child";

  if (!ref.base) return "none";
  if (article && (article === ref.base || article.startsWith(`${ref.base}.`)))
    return "base";
  if (
    compactBase &&
    (unitId.includes(compactBase) || path.includes(compactBase))
  )
    return "base";
  return "none";
};

const isConcreteArticleRef = (value: string) =>
  /^\d+(?:\.\d+)?(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)?$/.test(
    value
  );

const extractHitReference = (hit: RetrievalHit): string | null => {
  const candidates = [hit.apartado_path, hit.articulo_num, hit.unit_id];
  for (const candidate of candidates) {
    const normalized = normalizeArticleToken(candidate ?? "");
    if (normalized && isConcreteArticleRef(normalized)) return normalized;
  }
  return null;
};

const tokenizeForOverlap = (value: string) =>
  Array.from(
    new Set(
      normalizeLooseText(value)
        .split(" ")
        .filter((token) => token.length >= 4)
    )
  );

const lexicalOverlapScore = (question: string, hit: RetrievalHit) => {
  const questionTokens = tokenizeForOverlap(question);
  if (questionTokens.length === 0) return 0;

  const haystack = normalizeLooseText(
    [hit.titulo_ley, hit.articulo_num, hit.apartado_path, hit.contenido]
      .filter(Boolean)
      .join(" ")
  );

  let matches = 0;
  for (const token of questionTokens)
    if (haystack.includes(token)) matches += 1;

  return matches / questionTokens.length;
};

const articleMatchBoost = (kind: ArticleMatchKind) => {
  switch (kind) {
    case "exact":
      return 0.42;
    case "child":
      return 0.28;
    case "base":
      return 0.16;
    default:
      return 0;
  }
};

const mergeAndRankHits = (
  semanticHits: RetrievalHit[],
  articleHitsByQuery: Array<ArticleQuery & { hits: RetrievalHit[] }>,
  articleRefs: ArticleRef[],
  boeFilter: string | null
) => {
  const merged = new Map<string, RetrievalHit>();

  const scoreHit = (hit: RetrievalHit) => {
    const matches = articleRefs
      .map((ref) => ({ ref, kind: detectArticleMatch(hit, ref) }))
      .filter((item) => item.kind !== "none");
    const articleBoost = matches.reduce(
      (max, item) => Math.max(max, articleMatchBoost(item.kind)),
      0
    );
    const boeBoost = boeFilter && hit.id_boe === boeFilter ? 0.12 : 0;
    const sourceBoost = hit.source === "buscar_articulos" ? 0.04 : 0;
    return {
      score: hit.similarity + articleBoost + boeBoost + sourceBoost,
      articleMatches: Array.from(
        new Set(matches.map((item) => item.ref.normalized))
      )
    };
  };

  const upsert = (hit: RetrievalHit) => {
    const key = `${hit.id ?? "null"}|${hit.unit_id ?? "null"}|${hit.articulo_num ?? "null"}`;
    const scored = scoreHit(hit);
    const next: RetrievalHit = {
      ...hit,
      score: scored.score,
      article_matches: scored.articleMatches
    };

    const previous = merged.get(key);
    if (!previous || next.score > previous.score) {
      merged.set(key, next);
      return;
    }

    previous.article_matches = Array.from(
      new Set([...previous.article_matches, ...next.article_matches])
    );
    previous.score = Math.max(previous.score, next.score);
    previous.similarity = Math.max(previous.similarity, next.similarity);
  };

  for (const hit of semanticHits) upsert(hit);
  for (const articleQuery of articleHitsByQuery) {
    for (const hit of articleQuery.hits) {
      upsert({
        ...hit,
        source: "buscar_articulos"
      });
    }
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      right.score - left.score ||
      right.similarity - left.similarity ||
      (right.fecha_actualizacion ?? "").localeCompare(
        left.fecha_actualizacion ?? ""
      )
  );
};

const buildReferenceResolutions = (
  question: string,
  ranked: RetrievalHit[],
  articleRefs: ArticleRef[],
  articleHitsByQuery: Array<ArticleQuery & { hits: RetrievalHit[] }>
): ReferenceResolution[] =>
  articleRefs.map((ref) => {
    const relevantHits = articleHitsByQuery
      .filter((query) => query.requested === ref.normalized)
      .flatMap((query) => query.hits);
    const hitPool = relevantHits.length > 0 ? relevantHits : ranked;

    const requestedExact = hitPool.find(
      (hit) => detectArticleMatch(hit, ref) === "exact"
    );
    const requestedChild = hitPool.find(
      (hit) => detectArticleMatch(hit, ref) === "child"
    );
    const requestedBase = hitPool.find(
      (hit) => detectArticleMatch(hit, ref) === "base"
    );
    const requestedBest =
      requestedExact ?? requestedChild ?? requestedBase ?? null;

    const candidates = new Map<
      string,
      { score: number; overlap: number; hits: RetrievalHit[] }
    >();
    for (const hit of hitPool) {
      const candidateRef = extractHitReference(hit);
      if (!candidateRef || candidateRef === ref.normalized) continue;
      const existing = candidates.get(candidateRef) ?? {
        score: 0,
        overlap: 0,
        hits: []
      };
      const overlap = lexicalOverlapScore(question, hit);
      existing.score +=
        hit.score + overlap * 0.25 + (candidateRef.includes(".") ? 0.08 : 0);
      existing.overlap = Math.max(existing.overlap, overlap);
      if (existing.hits.length < 2) existing.hits.push(hit);
      candidates.set(candidateRef, existing);
    }

    const topAlternative = Array.from(candidates.entries()).sort(
      (left, right) =>
        right[1].score - left[1].score || right[1].overlap - left[1].overlap
    )[0];

    const requestedScore = requestedBest?.score ?? 0;
    const requestedSimilarity = requestedBest?.similarity ?? 0;
    const requestedOverlap = requestedBest
      ? lexicalOverlapScore(question, requestedBest)
      : 0;
    const alternativeWins = Boolean(
      topAlternative &&
      (!requestedBest ||
        topAlternative[1].score >= requestedScore + 0.18 ||
        (requestedSimilarity < 0.32 &&
          topAlternative[1].score >= requestedScore + 0.08) ||
        (topAlternative[1].overlap >= requestedOverlap + 0.2 &&
          topAlternative[1].score >= requestedScore))
    );

    if (
      topAlternative &&
      alternativeWins &&
      (topAlternative[1].overlap >= 0.18 ||
        topAlternative[1].score >= requestedScore + 0.22)
    ) {
      const alternativeRef = topAlternative[0];
      return {
        requested: ref,
        forcedHits: topAlternative[1].hits,
        note:
          `La referencia solicitada ${ref.normalized} no encaja bien con el contexto recuperado. ` +
          `La referencia juridica que mejor encaja con la pregunta es ${alternativeRef}. ` +
          `Debe plantearse como una posible correccion prudente del usuario y explicarse sin afirmar que la referencia original es imposible.`
      };
    }

    return {
      requested: ref,
      forcedHits: [requestedExact, requestedChild, requestedBase].filter(
        (hit): hit is RetrievalHit => Boolean(hit)
      ),
      note: null
    };
  });

const selectContextHits = (
  ranked: RetrievalHit[],
  resolutions: ReferenceResolution[]
) => {
  const selected: RetrievalHit[] = [];
  const seen = new Set<string>();

  const add = (hit: RetrievalHit | undefined) => {
    if (!hit) return;
    const key = `${hit.id ?? "null"}|${hit.unit_id ?? "null"}|${hit.articulo_num ?? "null"}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(hit);
  };

  for (const resolution of resolutions)
    for (const hit of resolution.forcedHits) add(hit);

  const generalCandidates = ranked.filter(
    (hit) => hit.source === "buscar_ley" || hit.article_matches.length === 0
  );
  for (const hit of generalCandidates) {
    if (selected.length >= MAX_CONTEXT_HITS) break;
    const generalCount = selected.filter(
      (row) => row.source === "buscar_ley" || row.article_matches.length === 0
    ).length;
    if (generalCount >= MIN_GENERAL_CONTEXT_HITS) break;
    add(hit);
  }

  for (const hit of ranked) {
    if (selected.length >= MAX_CONTEXT_HITS) break;
    add(hit);
  }

  return selected.slice(0, MAX_CONTEXT_HITS);
};

const buildRetrievalNotes = (
  articleRefs: ArticleRef[],
  contextHits: RetrievalHit[],
  inferredLaw: ReturnType<typeof inferLawAlias>,
  resolutions: ReferenceResolution[]
) => {
  const notes: string[] = [];

  if (inferredLaw)
    notes.push(
      `Se ha priorizado ${inferredLaw.label} por la referencia detectada en la pregunta.`
    );

  for (const resolution of resolutions)
    if (resolution.note) notes.push(resolution.note);

  for (const ref of articleRefs) {
    const bestKind = contextHits.reduce<ArticleMatchKind>((current, hit) => {
      const kind = detectArticleMatch(hit, ref);
      const priority = { exact: 3, child: 2, base: 1, none: 0 } as const;
      return priority[kind] > priority[current] ? kind : current;
    }, "none");

    if (bestKind === "base" && ref.base && ref.base !== ref.normalized) {
      notes.push(
        `No hubo coincidencia exacta para el articulo ${ref.normalized}; se recuperaron fragmentos del articulo base ${ref.base} y apartados relacionados.`
      );
    } else if (bestKind === "none") {
      notes.push(
        `No se recupero una coincidencia clara para el articulo ${ref.normalized}; la respuesta debe apoyarse solo en el contexto tematico encontrado.`
      );
    }
  }

  return notes;
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      ok: true,
      service: "ask",
      search_mode: "rag_only",
      embedding_model: OPENROUTER_EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM,
      has_openrouter_key: Boolean(OPENROUTER_API_KEY)
    });
  }

  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return json(
      { code: "CONFIG_ERROR", message: "Missing Supabase env vars" },
      500
    );

  if (!OPENROUTER_API_KEY)
    return json(
      { code: "CONFIG_ERROR", message: "Missing OPENROUTER_API_KEY" },
      500
    );

  let stage = "init";

  try {
    stage = "parse_body";
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const question = safeText(
      body.message ?? body.question ?? body.pregunta,
      MAX_MESSAGE_CHARS
    );
    if (!question)
      return json(
        {
          code: "BAD_REQUEST",
          message: "Debes enviar message/question/pregunta"
        },
        400
      );

    stage = "parse_history";
    const history = extractHistory(body.history);
    const contextualQuestion = buildContextualQuestion(question, history);
    const articleRefs = extractArticleRefs(
      `${question}\n${contextualQuestion}`
    );
    const boeRefs = extractBoeRefs(`${question}\n${contextualQuestion}`);
    const inferredLaw = inferLawAlias(`${question}\n${contextualQuestion}`);
    const boeFilter = boeRefs[0] ?? inferredLaw?.boeId ?? null;
    const lawHint = inferredLaw?.hint ?? "";

    const { semanticQueries, articleQueries, allQueries } =
      buildRetrievalQueries(question, contextualQuestion, articleRefs, lawHint);

    stage = "bearer";
    const token = bearer(req.headers.get("Authorization"));
    if (!token)
      return json(
        { code: "UNAUTHORIZED", message: "Missing bearer token" },
        401
      );

    stage = "supabase_client";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    stage = "auth_get_user";
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);
    if (authError || !user)
      return json({ code: "UNAUTHORIZED", message: "Invalid session" }, 401);

    stage = "embedding_request";
    const emb = await callOpenRouter("/embeddings", {
      model: OPENROUTER_EMBEDDING_MODEL,
      input: allQueries,
      dimensions: EMBEDDING_DIM,
      encoding_format: "float"
    });

    stage = "embedding_parse";
    const embData = (emb as Record<string, unknown>).data;
    if (!Array.isArray(embData) || embData.length !== allQueries.length) {
      throw new Error(
        `Embeddings payload invalido: recibidos ${Array.isArray(embData) ? embData.length : 0}, esperados ${allQueries.length}`
      );
    }

    const embeddingsByQuery = new Map<string, number[]>();
    for (let index = 0; index < allQueries.length; index += 1) {
      const item = embData[index];
      if (!item || typeof item !== "object")
        throw new Error(`Embeddings payload invalido en indice ${index}`);

      const vector = validateEmbedding(
        (item as Record<string, unknown>).embedding,
        index
      );
      embeddingsByQuery.set(allQueries[index], vector);
    }

    stage = "rpc_buscar_ley";
    const semanticCalls = semanticQueries.map(async (query) => {
      const embedding = embeddingsByQuery.get(query);
      if (!embedding)
        throw new Error(
          `Embedding no encontrado para query semantica: ${query}`
        );

      const { data, error } = await supabase.rpc("buscar_ley", {
        query_embedding: embedding,
        match_threshold: LAW_MATCH_THRESHOLD,
        match_count: LAW_MATCH_COUNT,
        filter_id_boe: boeFilter,
        filter_unit_type: null
      });

      if (error) throw new Error(`buscar_ley failed: ${error.message}`);
      return normalizeRpcRows(
        (data ?? []) as Array<Record<string, unknown>>,
        "buscar_ley"
      );
    });

    stage = "rpc_buscar_articulos";
    const articleCalls = articleQueries.map(async (item) => {
      const embedding = embeddingsByQuery.get(item.query);
      if (!embedding)
        throw new Error(
          `Embedding no encontrado para query de articulo: ${item.query}`
        );

      const { data, error } = await supabase.rpc("buscar_articulos", {
        query_embedding: embedding,
        match_threshold: ARTICLE_MATCH_THRESHOLD,
        match_count: ARTICLE_MATCH_COUNT,
        filter_id_boe: boeFilter,
        filter_article: item.filter
      });

      if (error) throw new Error(`buscar_articulos failed: ${error.message}`);
      return {
        ...item,
        hits: normalizeRpcRows(
          (data ?? []) as Array<Record<string, unknown>>,
          "buscar_articulos"
        )
      };
    });

    const semanticResults = (await Promise.all(semanticCalls)).flat();
    const articleResults = await Promise.all(articleCalls);
    const ranked = mergeAndRankHits(
      semanticResults,
      articleResults,
      articleRefs,
      boeFilter
    );
    const referenceResolutions = buildReferenceResolutions(
      question,
      ranked,
      articleRefs,
      articleResults
    );
    const contextHits = selectContextHits(ranked, referenceResolutions);
    const retrievalNotes = buildRetrievalNotes(
      articleRefs,
      contextHits,
      inferredLaw,
      referenceResolutions
    );

    const debug = {
      stage,
      search_mode: "rag_only",
      embedding_model: OPENROUTER_EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM,
      queries: {
        total: allQueries.length,
        semantic: semanticQueries.length,
        article: articleQueries.length
      },
      refs: {
        boe: boeRefs,
        inferred_boe: inferredLaw?.boeId ?? null,
        article: articleRefs.map((ref) => ({
          requested: ref.normalized,
          base: ref.base
        }))
      },
      hits: {
        semantic_raw: semanticResults.length,
        article_raw: articleResults.reduce(
          (acc, item) => acc + item.hits.length,
          0
        ),
        ranked: ranked.length,
        context: contextHits.length
      },
      notes: retrievalNotes
    };

    if (contextHits.length === 0) {
      return json({
        answer: REFUSAL_MESSAGE,
        message: REFUSAL_MESSAGE,
        content: REFUSAL_MESSAGE,
        citations: [],
        refused: true,
        mindMap: false,
        ...(body.debug === true ? { debug } : {})
      });
    }

    stage = "build_context";
    const citations = contextHits.map((hit) => ({
      boe_id: hit.id_boe,
      doc_title: hit.titulo_ley,
      articulo: hit.articulo_num,
      unit_type: hit.unit_type,
      unit_id: hit.unit_id,
      apartado_path: hit.apartado_path,
      url: hit.url_norma,
      fecha_publicacion: hit.fecha_publicacion,
      fecha_vigencia: hit.fecha_vigencia,
      fecha_actualizacion: hit.fecha_actualizacion,
      similarity: hit.similarity,
      score: hit.score,
      source: hit.source,
      article_matches: hit.article_matches
    }));

    let contextBudget = MAX_TOTAL_CONTEXT_CHARS;
    const context = contextHits
      .map((hit, index) => {
        if (contextBudget <= 0) return "";
        const title =
          hit.articulo_num || hit.titulo_ley || `Fragmento ${index + 1}`;
        const meta = [
          hit.titulo_ley ? `Norma: ${hit.titulo_ley}` : "",
          hit.unit_type ? `Tipo: ${hit.unit_type}` : "",
          hit.unit_id ? `Unidad: ${hit.unit_id}` : "",
          hit.apartado_path ? `Ruta: ${hit.apartado_path}` : "",
          hit.fecha_vigencia ? `Vigencia: ${hit.fecha_vigencia}` : "",
          hit.fecha_actualizacion
            ? `Actualizacion: ${hit.fecha_actualizacion}`
            : "",
          hit.eli ? `ELI: ${hit.eli}` : ""
        ]
          .filter(Boolean)
          .join(" | ");
        const contentLimit = hit.article_matches.length > 0 ? 3200 : 1500;
        const available = Math.max(0, contextBudget - 400);
        if (available <= 0) return "";
        const content = safeText(
          hit.contenido,
          Math.min(contentLimit, available)
        );
        const block = `Contexto ${index + 1}\nTitulo: ${title}\n${meta}\nContenido:\n${content}`;
        contextBudget = Math.max(0, contextBudget - block.length);
        return block;
      })
      .filter((block) => block.length > 0)
      .join("\n\n---\n\n");

    stage = "chat_request";
    const llm = await callOpenRouter("/chat/completions", {
      model: safeText(body.model, 120) || OPENROUTER_CHAT_MODEL,
      temperature: 0.1,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            `Eres un asistente especializado en preparacion de oposiciones. Tu mision es ayudar al opositor a estudiar, comprender y memorizar el temario de forma efectiva, fiable y clara.\n\n` +
            `IDENTIDAD Y TONO\n` +
            `- Eres formal en el fondo, pero natural y cercano en la forma. Evita el lenguaje robotico o excesivamente tecnico.\n` +
            `- Tutea al usuario de forma respetuosa. Transmite confianza y seguridad, como lo haria un buen preparador de oposiciones.\n` +
            `- Nunca uses frases vacias como "Claro" o "Por supuesto". Ve directo al grano.\n` +
            `- Usa un tono positivo y motivador cuando sea apropiado, especialmente si el usuario expresa dudas o frustracion.\n\n` +
            `FIABILIDAD Y RIGOR\n` +
            `- Responde SIEMPRE con informacion respaldada por el contexto juridico recuperado de la base de conocimiento (RAG). No inventes ni uses conocimiento externo.\n` +
            `- Si la referencia del usuario no es exacta pero existe una norma o articulo cercano en la base de conocimiento, corrigela con cautela, indicando cual es la referencia correcta.\n` +
            `- Si la informacion disponible es parcial, responde solo la parte respaldada y avisa explicitamente de que punto no esta cubierto.\n` +
            `- Nunca presentes como cierto algo sobre lo que tengas dudas. Es preferible decir "no lo encuentro en el material aportado" que dar una respuesta incorrecta.\n\n` +
            `ESTRUCTURA DE LAS RESPUESTAS\n` +
            `Cuando haya base suficiente, organiza tu respuesta asi:\n` +
            `**Respuesta**\n` +
            `Explicacion clara y directa del concepto o pregunta.\n\n` +
            `**Base legal o tematica**\n` +
            `Norma, articulo, tema o epigrafe concreto que respalda la respuesta.\n\n` +
            `**Matices o limites**\n` +
            `Excepciones, condiciones, limites temporales o aspectos que el opositor debe tener presentes para no caer en errores frecuentes en examen.\n\n` +
            `Si la pregunta no tiene base suficiente en el material, responde exactamente: "${REFUSAL_MESSAGE}"\n\n` +
            `FORMATO Y PRESENTACION\n` +
            `- Usa listas, negritas y estructura visual cuando mejoren la comprension.\n` +
            `- Para comparaciones, elementos con varios campos o clasificaciones legales, ofrece proactivamente crear una tabla: "Quieres que te prepare esto en formato tabla para que sea mas facil de estudiar?"\n` +
            `- Para temas largos, ofrece dividir la explicacion por bloques o apartados.\n` +
            `- Ajusta la profundidad de la respuesta al nivel de la pregunta: no des una leccion magistral si solo te piden una definicion rapida.\n\n` +
            `SUGERENCIAS PROACTIVAS\n` +
            `- Al final de cada respuesta, cuando sea util y natural, anade una sugerencia breve que ayude al opositor a seguir avanzando.\n` +
            `- No lo hagas en todas las respuestas de forma mecanica; solo cuando realmente aporte valor.\n\n` +
            `LO QUE NUNCA DEBES HACER\n` +
            `- Inventar articulos, normas, fechas o datos que no esten en el material recuperado.\n` +
            `- Usar un lenguaje condescendiente o excesivamente academico sin necesidad.\n` +
            `- Dar respuestas larguisimas cuando la pregunta es simple.\n` +
            `- Ignorar errores en las referencias del usuario; corrigelos siempre con tacto.\n` +
            `- Repetir la pregunta del usuario antes de responder.\n\n` +
            `El historial es solo contexto conversacional auxiliar.`
        },
        {
          role: "user",
          content:
            `Historial auxiliar:\n${history.map((item) => `${item.role}: ${item.text}`).join("\n") || "(sin historial)"}\n\n` +
            `Notas de recuperacion:\n${retrievalNotes.join("\n") || "(sin notas)"}\n\n` +
            `Pregunta:\n${question}\n\n` +
            `Contexto juridico recuperado:\n${context}`
        }
      ]
    });

    stage = "chat_parse";
    let answer = "";
    const choices = (llm as Record<string, unknown>).choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first.message as Record<string, unknown> | undefined;
      answer = normalizeAnswerText(message?.content, 12000);
    }

    if (answer === REFUSAL_MESSAGE && contextHits.length > 0) {
      const labels = Array.from(
        new Set(
          contextHits
            .map((hit) => hit.articulo_num || hit.titulo_ley || hit.id_boe)
            .filter((value): value is string => Boolean(value))
        )
      ).slice(0, 4);
      answer =
        `Si hay contexto recuperado en RAG (${labels.join(", ")}), pero no suficiente para cubrir toda la pregunta con precision completa. ` +
        `La respuesta debe limitarse a lo que consta expresamente en esos fragmentos.`;
    }

    answer = answer || REFUSAL_MESSAGE;

    return json({
      answer,
      message: answer,
      content: answer,
      citations,
      refused: answer === REFUSAL_MESSAGE,
      mindMap: false,
      ...(body.debug === true ? { debug } : {})
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ask failure";
    console.error("[ask:error]", { stage, message });
    return json(
      {
        code: "ASK_FAILED",
        stage,
        message
      },
      502
    );
  }
});
