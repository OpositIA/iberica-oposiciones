import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { marked } from "https://esm.sh/marked@12.0.2";

// ─────────────────────────────────────────────────────────────────────────────
// MARKED CONFIG
// ─────────────────────────────────────────────────────────────────────────────

marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT VARIABLES
// ─────────────────────────────────────────────────────────────────────────────

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")?.trim() ?? "";
const OPENROUTER_BASE_URL =
  Deno.env.get("OPENROUTER_BASE_URL")?.trim() ?? "https://openrouter.ai/api/v1";
const OPENROUTER_APP_URL =
  Deno.env.get("OPENROUTER_APP_URL")?.trim() ??
  "https://ibericaoposiciones.com";
const OPENROUTER_APP_NAME =
  Deno.env.get("OPENROUTER_APP_NAME")?.trim() ?? "Iberica Oposiciones";

const OPENROUTER_REWRITE_MODEL =
  Deno.env.get("OPENROUTER_REWRITE_MODEL")?.trim() ??
  Deno.env.get("OPENROUTER_PLANNING_MODEL")?.trim() ??
  "openrouter/elephant-alpha";
const OPENROUTER_CHAT_MODEL =
  Deno.env.get("OPENROUTER_CHAT_MODEL")?.trim() ?? "qwen/qwen3-235b-a22b-2507";
const OPENROUTER_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
const EMBEDDING_DIM = 4096;

const OPENROUTER_TIMEOUT_MS = Math.max(
  5_000,
  Number(Deno.env.get("OPENROUTER_TIMEOUT_MS") ?? "30000")
);
const REWRITE_TIMEOUT_MS = Math.max(
  3_000,
  Number(Deno.env.get("ASK_REWRITE_TIMEOUT_MS") ?? "12000")
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

const LAW_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_LAW_MATCH_THRESHOLD") ?? "0.22"
);
const LAW_RETRY_THRESHOLD = Number(
  Deno.env.get("ASK_LAW_RETRY_THRESHOLD") ?? "0.14"
);
const LAW_MATCH_COUNT = Math.max(
  10,
  Number(Deno.env.get("ASK_LAW_MATCH_COUNT") ?? "20")
);

// Tope dinámico por artículo: si el usuario pregunta por UN solo artículo,
// queremos traer todos sus apartados (algunos artículos del BOE tienen 100+).
// Si pregunta por varios, repartimos para que quepa todo en el contexto.
const ARTICLE_FETCH_SINGLE = Math.max(
  20,
  Number(Deno.env.get("ASK_ARTICLE_FETCH_SINGLE") ?? "60")
);
const ARTICLE_FETCH_MULTI = Math.max(
  6,
  Number(Deno.env.get("ASK_ARTICLE_FETCH_MULTI") ?? "12")
);

const MAX_CONTEXT_HITS = Math.max(
  10,
  Number(Deno.env.get("ASK_MAX_CONTEXT_HITS") ?? "40")
);
const MAX_HITS_PER_ARTICLE = Math.max(
  1,
  Number(Deno.env.get("ASK_MAX_HITS_PER_ARTICLE") ?? "3")
);
const MAX_CONTENT_CHARS = Math.max(
  1_200,
  Number(Deno.env.get("ASK_MAX_CONTENT_CHARS") ?? "3500")
);
const CHAT_MAX_TOKENS = Math.max(
  400,
  Number(Deno.env.get("ASK_CHAT_MAX_TOKENS") ?? "1800")
);
const MIND_MAP_MAX_TOKENS = Math.max(
  1_200,
  Number(Deno.env.get("ASK_MIND_MAP_MAX_TOKENS") ?? "4000")
);
const REWRITE_MAX_TOKENS = Math.max(
  80,
  Number(Deno.env.get("ASK_REWRITE_MAX_TOKENS") ?? "260")
);
const MAX_REWRITE_QUERIES = Math.max(
  1,
  Number(Deno.env.get("ASK_MAX_REWRITE_QUERIES") ?? "6")
);
const MAX_ARTICLE_REFS = Math.max(
  1,
  Number(Deno.env.get("ASK_MAX_ARTICLE_REFS") ?? "8")
);
const MAX_MESSAGE_CHARS = 3_000;
const MAX_REWRITE_CHARS = 400;
const FALLBACK_MIN_SCORE = 0.28;
const DAILY_USAGE_TIMEZONE = "Europe/Madrid";

const REFUSAL_MESSAGE =
  "No lo encuentro en el material aportado. Para afinar la búsqueda, indícame la norma, el artículo o el tema concreto.";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type HistoryLine = { role: "user" | "assistant" | "system"; text: string };

type DailyQuotaResult = {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  day: string;
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
  score: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });

const safeText = (value: unknown, max = 12_000): string =>
  (typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? String(value)
    : ""
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

const safeCompactText = (value: unknown, max = 300) =>
  safeText(value, max)
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

const normalizeAnswerText = (value: unknown, max = 12_000) =>
  safeText(value, max)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripJsonFences = (value: string) =>
  value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

const extractBearerToken = (authHeader: string | null) =>
  authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";

const normalizeDailyQuotaResult = (row: unknown): DailyQuotaResult | null => {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;

  const used =
    typeof record.used === "number" && Number.isFinite(record.used)
      ? Math.max(0, Math.floor(record.used))
      : 0;
  const limit =
    typeof record.limit === "number" &&
    Number.isFinite(record.limit) &&
    record.limit > 0
      ? Math.floor(record.limit)
      : 0;
  const remaining =
    typeof record.remaining === "number" && Number.isFinite(record.remaining)
      ? Math.max(0, Math.floor(record.remaining))
      : Math.max(limit - used, 0);

  return {
    allowed: record.allowed === true,
    remaining,
    used,
    limit,
    day: typeof record.day === "string" ? record.day : String(record.day ?? "")
  };
};

const extractHistory = (rawHistory: unknown): HistoryLine[] =>
  Array.isArray(rawHistory)
    ? rawHistory
        .map((item) => {
          const row =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : null;
          if (!row) return null;
          const rawRole = safeText(row.role, 20).toLowerCase();
          const role: HistoryLine["role"] =
            rawRole === "assistant" || rawRole === "model"
              ? "assistant"
              : rawRole === "system"
                ? "system"
                : "user";
          const text = safeCompactText(
            Array.isArray(row.parts)
              ? row.parts
                  .map((p) =>
                    safeText((p as Record<string, unknown>)?.text, 800)
                  )
                  .join("\n")
              : (row.content ?? row.text),
            1_400
          );
          return text ? { role, text } : null;
        })
        .filter((item): item is HistoryLine => Boolean(item))
        .slice(-6)
    : [];

const normalizeForMatch = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function extractKeywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of normalizeForMatch(text).split(/[^\p{L}\p{N}]+/u)) {
    if (!t) continue;
    if (/^\d+$/.test(t) || t.length >= 4) out.add(t);
  }
  return out;
}

function extractArticleRefsFromRewrites(queries: string[]): string[] {
  const refs = new Set<string>();
  const pattern =
    /art(?:[íi]?culos?)?\.?\s*(\d+(?:[.\-]\d+)?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)/gi;
  for (const q of queries) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(q)) !== null) {
      const clean = m[1].toLowerCase().replace(/\s+/g, "");
      if (clean) refs.add(clean);
    }
  }
  return Array.from(refs).slice(0, MAX_ARTICLE_REFS);
}

function baseArticleNumber(s: string): string {
  const n = normalizeForMatch(s ?? "");
  const m = n.match(
    /(\d+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)?)/
  );
  return m ? m[1] : n;
}

function findEmbeddingForRef(
  ref: string,
  embeddings: Array<{ query: string; vector: number[] }>
): number[] | null {
  const refNorm = normalizeForMatch(ref);
  for (const e of embeddings) {
    const qRefs = extractArticleRefsFromRewrites([e.query]).map(
      normalizeForMatch
    );
    if (qRefs.includes(refNorm)) return e.vector;
  }
  return null;
}

// Pinea TODOS los chunks que pertenezcan a la norma más relevante para
// cada ref. Como la RPC ordena las normas por similarity descendente
// y agrupa los chunks de cada norma juntos, basta con coger el bloque
// inicial donde el id_boe coincide con el del primer hit.
function pinArticleRefs(
  hits: RetrievalHit[],
  refs: string[],
  hardCapPerRef: number
): RetrievalHit[] {
  if (refs.length === 0) return [];
  const pinned: RetrievalHit[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const refBase = baseArticleNumber(ref);
    const candidates = hits.filter((h) => {
      const id = h.id ?? "";
      if (seen.has(id)) return false;
      const key = baseArticleNumber(h.articulo_num || h.unit_id || "");
      return key === refBase;
    });
    if (candidates.length === 0) continue;

    // La norma "ganadora" es la del primer candidato (la RPC ya las ordenó).
    const winningBoe = candidates[0].id_boe;
    const fromWinningBoe = candidates
      .filter((c) => c.id_boe === winningBoe)
      .sort((a, b) => {
        // Artículo completo primero, luego apartados en orden natural.
        const aFull = a.unit_type === "article" ? 0 : 1;
        const bFull = b.unit_type === "article" ? 0 : 1;
        if (aFull !== bFull) return aFull - bFull;
        const an = normalizeForMatch(a.articulo_num ?? a.unit_id ?? "");
        const bn = normalizeForMatch(b.articulo_num ?? b.unit_id ?? "");
        return an.localeCompare(bn, "es", { numeric: true });
      });

    for (const m of fromWinningBoe.slice(0, hardCapPerRef)) {
      pinned.push(m);
      if (m.id) seen.add(m.id);
    }
  }
  return pinned;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  let md = text ?? "";

  // 1) Quita trailing spaces (evitan <br> fantasma).
  md = md.replace(/[ \t]+$/gm, "");

  // 2) Ordinales españoles "1.º " → "1. ".
  md = md.replace(/^(\s*)(\d+)\.º\s+/gm, "$1$2. ");

  // 3) Desatasca tablas pegadas en una sola línea.
  const TABLE_SEP = /\|(?:\s*:?-{3,}:?\s*\|){2,}/;
  if (TABLE_SEP.test(md)) {
    md = md
      .replace(/([^\n])\s*(\|(?:\s*:?-{3,}:?\s*\|){2,})/g, "$1\n$2")
      .replace(/(\|(?:\s*:?-{3,}:?\s*\|){2,})\s+(\|)/g, "$1\n$2")
      .replace(/(\|[^|\n]+\|[^|\n]+\|)\s+(\|[^-|\n])/g, "$1\n$2");
  }

  // 4) Normaliza indentación de listas (1 o 2 espacios → múltiplo de 2).
  md = md
    .split("\n")
    .map((line) => {
      const m = line.match(/^( +)([-*+]\s|\d+[.)]\s)(.*)$/);
      if (!m) return line;
      const [, indent, marker, rest] = m;
      let len = indent.length;
      if (len === 1) len = 2;
      else if (len % 2 === 1) len += 1;
      return " ".repeat(len) + marker + rest;
    })
    .join("\n");

  // 5) Línea en blanco antes de listas (evita pegado de párrafo + lista).
  md = md.replace(/([^\n])\n(\s*(?:[-*+]|\d+[.)])\s)/g, "$1\n\n$2");

  try {
    return marked.parse(md) as string;
  } catch {
    return `<pre>${md.replace(/[<>&]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
    )}</pre>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENROUTER CLIENT
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenRouter(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number = OPENROUTER_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  const response = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": OPENROUTER_APP_URL,
      "X-Title": OPENROUTER_APP_NAME
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof data === "object" && data !== null
        ? safeText(
            (data as Record<string, unknown>).message ??
              (data as Record<string, unknown>).error,
            500
          )
        : "";
    throw new Error(msg || `OpenRouter error (${response.status})`);
  }
  return data as Record<string, unknown>;
}

const getLlmText = (data: Record<string, unknown>): string =>
  normalizeAnswerText(
    (data.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message
      ?.content,
    20_000
  );

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  PHASE 1 — NORMALIZE
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const REWRITE_SYSTEM = `Eres un normalizador de consultas jurídicas. Tu ÚNICA tarea es limpiar la pregunta del usuario para que quede clara antes de buscar en una base jurídica.

LO QUE SÍ HACES:
- Corriges faltas de ortografía, tildes y puntuación. Ejemplo: "constitucion española" → "Constitución Española".
- Expandes siglas y abreviaturas a su nombre completo: CE → Constitución Española; LGT → Ley General Tributaria; LOTC → Ley Orgánica del Tribunal Constitucional; LOPJ → Ley Orgánica del Poder Judicial; LBRL → Ley de Bases del Régimen Local; LECrim → Ley de Enjuiciamiento Criminal; LOREG → Ley Orgánica del Régimen Electoral General; etc. Si la sigla no es clara, déjala tal cual.
- Si el usuario menciona varios artículos distintos de una misma norma, genera UNA LÍNEA POR CADA ARTÍCULO con el formato: "artículo <número> <nombre de la norma>".
- Quitas lenguaje conversacional irrelevante para la búsqueda ("hazme un esquema de…", "explícame…", "dime qué dice…").

LO QUE NO HACES NUNCA:
- NO añades palabras, conceptos, temas, materias ni descripciones que el usuario no haya escrito. Si el usuario no ha dicho "delito fiscal", tú no escribes "delito fiscal".
- NO intentas adivinar qué regula un artículo ni qué trata una norma.
- NO respondes a la pregunta. NO explicas nada. NO añades contexto.
- NO reordenas ni reinterpretas la intención.

FORMATO DE SALIDA:
- Solo texto plano. Sin JSON. Sin markdown. Sin numeración. Sin guiones. Sin comillas. Sin viñetas.
- Una o varias líneas, cada una autocontenida.

EJEMPLOS:

Pregunta: "explicame el 27 de la CE"
Salida:
artículo 27 Constitución Española

Pregunta: "hazme un esquema del articulo 150,151 y 152 de la Constitucion española"
Salida:
artículo 150 Constitución Española
artículo 151 Constitución Española
artículo 152 Constitución Española

Pregunta: "que dice la LGT sobre el fraude fiscal"
Salida:
Ley General Tributaria fraude fiscal

Pregunta: "articulo 305 LGT"
Salida:
artículo 305 Ley General Tributaria

Pregunta: "diferencias entre el 143 y el 151 de la constitución"
Salida:
artículo 143 Constitución Española
artículo 151 Constitución Española`;

function cleanRewriteLine(line: string): string {
  let l = line.trim();
  l = l.replace(/^\s*[-*•]\s+/, "");
  l = l.replace(/^\s*\d+\s*[.)]\s+/, "");
  l = l.replace(
    /^[\s"'`\u00AB\u00BB\u201C\u201D\u2018\u2019]+|[\s"'`\u00AB\u00BB\u201C\u201D\u2018\u2019]+$/g,
    ""
  );
  l = l.replace(/\s+/g, " ").trim();
  if (l.length > MAX_REWRITE_CHARS) l = l.slice(0, MAX_REWRITE_CHARS).trim();
  return l;
}

function parseRewriteOutput(raw: string): string[] {
  if (!raw) return [];
  let text = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```\s*$/, "");
  const lines = text
    .split(/\r?\n/)
    .map(cleanRewriteLine)
    .filter((l) => l.length >= 3);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const l of lines) {
    const k = normalizeForMatch(l);
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(l);
    }
  }
  return unique.slice(0, MAX_REWRITE_QUERIES);
}

async function phase1_rewriteForRetrieval(
  question: string,
  history: HistoryLine[]
): Promise<string[]> {
  try {
    const historyBlock =
      history.length > 0
        ? history
            .slice(-2)
            .map((l) => `${l.role}: ${l.text}`)
            .join("\n") + "\n"
        : "";

    const data = await callOpenRouter(
      "/chat/completions",
      {
        model: OPENROUTER_REWRITE_MODEL,
        temperature: 0,
        max_tokens: REWRITE_MAX_TOKENS,
        messages: [
          { role: "system", content: REWRITE_SYSTEM },
          {
            role: "user",
            content: `${historyBlock}Pregunta: ${question}`
          }
        ]
      },
      REWRITE_TIMEOUT_MS
    );

    const queries = parseRewriteOutput(getLlmText(data));
    return queries.length > 0 ? queries : [question];
  } catch (err) {
    console.warn(
      "[ask:rewrite_fallback]",
      err instanceof Error ? err.message : err
    );
    return [question];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  PHASE 2 — RETRIEVE
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

const normalizeRpcRows = (
  rows: Array<Record<string, unknown>>
): RetrievalHit[] =>
  rows
    .map((row) => {
      const similarity = Number(row.similarity ?? row.rank ?? row.score ?? 0);
      return {
        id: safeText(row.id, 120) || null,
        id_boe: safeText(row.id_boe, 80) || null,
        titulo_ley: safeText(row.titulo_ley, 260) || null,
        articulo_num: safeText(row.articulo_num, 140) || null,
        unit_type: safeText(row.unit_type, 80) || null,
        unit_id: safeText(row.unit_id, 120) || null,
        apartado_path: safeText(row.apartado_path, 220) || null,
        contenido: safeText(row.contenido, 6_000) || null,
        url_norma: safeText(row.url_norma, 500) || null,
        fecha_actualizacion: safeText(row.fecha_actualizacion, 32) || null,
        fecha_vigencia: safeText(row.fecha_vigencia, 32) || null,
        fecha_publicacion: safeText(row.fecha_publicacion, 32) || null,
        eli: safeText(row.eli, 180) || null,
        similarity: Number.isFinite(similarity) ? similarity : 0,
        score: Number.isFinite(similarity) ? similarity : 0
      } as RetrievalHit;
    })
    .filter((r): r is RetrievalHit => r.contenido !== null);

async function runAllTasks<T>(
  tasks: Array<() => Promise<T>>
): Promise<{ values: T[]; errors: string[] }> {
  const settled = await Promise.allSettled(tasks.map((t) => t()));
  const values: T[] = [];
  const errors: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") values.push(r.value);
    else
      errors.push(
        r.reason instanceof Error ? r.reason.message : "Unknown error"
      );
  }
  return { values, errors };
}

function scoreHit(hit: RetrievalHit, keywords: Set<string>): number {
  if (keywords.size === 0) return hit.similarity;

  const metaText = normalizeForMatch(
    [
      hit.titulo_ley,
      hit.articulo_num,
      hit.apartado_path,
      hit.unit_id,
      hit.unit_type
    ]
      .filter(Boolean)
      .join(" ")
  );
  const contentText = normalizeForMatch(hit.contenido ?? "");

  let metaMatches = 0;
  let contentMatches = 0;
  for (const kw of keywords) {
    if (metaText.includes(kw)) metaMatches++;
    if (contentText.includes(kw)) contentMatches++;
  }

  const n = keywords.size;
  const metaBonus = (metaMatches / n) * 0.35;
  const contentBonus = (contentMatches / n) * 0.1;
  const fullArticleBonus = hit.unit_type === "article" ? 0.05 : 0;

  return hit.similarity + metaBonus + contentBonus + fullArticleBonus;
}

async function phase2_retrieve(
  queries: string[],
  keywordSource: string,
  articleRefs: string[],
  supabase: ReturnType<typeof createClient>,
  threshold: number
): Promise<{ hits: RetrievalHit[]; errors: string[] }> {
  const cleanQueries = Array.from(
    new Set(
      queries
        .map((q) => safeCompactText(q, MAX_REWRITE_CHARS))
        .filter((q) => q.length >= 3)
    )
  );

  if (cleanQueries.length === 0) {
    return { hits: [], errors: [] };
  }

  const embResponse = await callOpenRouter("/embeddings", {
    model: OPENROUTER_EMBEDDING_MODEL,
    input: cleanQueries,
    dimensions: EMBEDDING_DIM,
    encoding_format: "float"
  });

  const embData = embResponse.data;
  if (!Array.isArray(embData) || embData.length !== cleanQueries.length) {
    throw new Error("Embeddings payload inválido");
  }

  const embeddings: Array<{ query: string; vector: number[] }> = [];
  for (let i = 0; i < cleanQueries.length; i++) {
    const item = embData[i] as Record<string, unknown> | undefined;
    if (Array.isArray(item?.embedding)) {
      embeddings.push({
        query: cleanQueries[i],
        vector: (item!.embedding as unknown[]).map((v) => Number(v))
      });
    }
  }

  const semanticTasks = embeddings.map((e) => async () => {
    const { data, error } = await supabase.rpc("buscar_ley", {
      query_embedding: e.vector,
      match_threshold: threshold,
      match_count: LAW_MATCH_COUNT,
      filter_id_boe: null,
      filter_unit_type: null
    });
    if (error) throw new Error(`buscar_ley: ${error.message}`);
    return normalizeRpcRows((data ?? []) as Array<Record<string, unknown>>);
  });

  const anchorVector =
    embeddings.find((e) =>
      /constituci|ley\b|c[oó]digo|reglamento|org[aá]nica|decreto/i.test(e.query)
    )?.vector ?? embeddings[0]?.vector;

  // Si solo hay UN ref → traemos hasta 60 chunks (artículos largos con muchos
  // apartados). Si hay varios → repartimos con 12 por cada uno.
  const articleFetchCount =
    articleRefs.length === 1 ? ARTICLE_FETCH_SINGLE : ARTICLE_FETCH_MULTI;

  const articleTasks =
    articleRefs.length > 0
      ? articleRefs.map((ref) => async () => {
          const ownVector =
            findEmbeddingForRef(ref, embeddings) ?? anchorVector;
          const { data, error } = await supabase.rpc(
            "buscar_articulo_por_numero",
            {
              article_num: ref,
              query_embedding: ownVector ?? null,
              match_count: articleFetchCount,
              filter_id_boe: null
            }
          );
          if (error)
            throw new Error(
              `buscar_articulo_por_numero(${ref}): ${error.message}`
            );
          return normalizeRpcRows(
            (data ?? []) as Array<Record<string, unknown>>
          );
        })
      : [];

  const { values: semanticValues, errors: semanticErrors } =
    await runAllTasks(semanticTasks);
  const { values: articleValues, errors: articleErrors } =
    await runAllTasks(articleTasks);

  const allHits = [...semanticValues.flat(), ...articleValues.flat()];

  const keywords = extractKeywords([keywordSource, ...cleanQueries].join(" "));

  const merged = new Map<string, RetrievalHit>();
  for (const hit of allHits) {
    const key = `${hit.id}|${hit.unit_id}|${hit.articulo_num}`;
    const scored = { ...hit, score: scoreHit(hit, keywords) };
    const prev = merged.get(key);
    if (!prev || scored.score > prev.score) merged.set(key, scored);
  }

  const ranked = Array.from(merged.values()).sort(
    (a, b) => b.score - a.score || b.similarity - a.similarity
  );

  return { hits: ranked, errors: [...semanticErrors, ...articleErrors] };
}

function diversifyByArticle(
  hits: RetrievalHit[],
  perArticle: number
): RetrievalHit[] {
  const count = new Map<string, number>();
  const kept: RetrievalHit[] = [];
  for (const h of hits) {
    const base = baseArticleNumber(
      (h.articulo_num || h.unit_id || h.id || "_").toString()
    );
    const key = `${h.id_boe ?? ""}|${base}`;
    const c = count.get(key) ?? 0;
    if (c < perArticle) {
      kept.push(h);
      count.set(key, c + 1);
    }
  }
  return kept;
}

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  PHASE 3 — SYNTHESIZE
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

function buildContext(
  hits: RetrievalHit[],
  articleRefs: string[],
  forMindMap = false
): { context: string; contextHits: RetrievalHit[] } {
  const maxHits = forMindMap
    ? Math.max(MAX_CONTEXT_HITS, 48)
    : MAX_CONTEXT_HITS;

  // Cap del pin por ref: mucho margen para 1 solo artículo (puede tener 60+
  // apartados); más conservador cuando se piden varios para que quepan todos.
  const hardCapPerRef = articleRefs.length === 1 ? 60 : 14;

  // 1) Pin: artículo completo + sus apartados de la norma más relevante.
  const pinned = pinArticleRefs(hits, articleRefs, hardCapPerRef);
  const pinnedIds = new Set(
    pinned.map((h) => h.id ?? "").filter((x) => x !== "")
  );

  // 2) Diversifica el resto por (BOE, artículo base).
  const rest = hits.filter((h) => !pinnedIds.has(h.id ?? ""));
  const diversified = diversifyByArticle(rest, MAX_HITS_PER_ARTICLE);

  // 3) Combina: pineados primero, luego el resto diversificado.
  const contextHits = [...pinned, ...diversified].slice(0, maxHits);

  let budget = forMindMap ? 60_000 : 60_000;
  const blocks: string[] = [];

  for (let i = 0; i < contextHits.length; i++) {
    if (budget <= 0) break;
    const hit = contextHits[i];
    const maxContent = Math.min(
      forMindMap ? 3_500 : MAX_CONTENT_CHARS,
      Math.max(0, budget - 350)
    );
    const content = safeText(hit.contenido, maxContent);
    const meta = [
      hit.titulo_ley ? `Norma: ${hit.titulo_ley}` : "",
      hit.unit_id ? `Unidad: ${hit.unit_id}` : "",
      hit.apartado_path ? `Ruta: ${hit.apartado_path}` : "",
      hit.eli ? `ELI: ${hit.eli}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    const block =
      `Contexto ${i + 1}\n` +
      `Título: ${hit.articulo_num || hit.titulo_ley || `Fragmento ${i + 1}`}\n` +
      `${meta}\n` +
      `Contenido:\n${content}`;

    budget -= block.length;
    blocks.push(block);
  }

  return { context: blocks.join("\n\n---\n\n"), contextHits };
}

function buildSynthesisMessages(
  question: string,
  history: HistoryLine[],
  context: string,
  forceGrounded = false
) {
  const historyBlock =
    history.length > 0
      ? `Conversación previa:\n${history
          .map((l) => `${l.role}: ${l.text}`)
          .join("\n")}\n\n`
      : "";

  const system =
    `Eres un profesor de Derecho español que ayuda a opositores.\n\n` +
    `REGLAS ESTRICTAS DE GROUNDING:\n` +
    `1. Usa EXCLUSIVAMENTE el Material de referencia. No añadas información de tu conocimiento previo, ni ejemplos históricos, ni datos de otras normas, ni jurisprudencia, ni notas culturales que no aparezcan literalmente en el Material.\n` +
    `2. Responde SOLO a lo que el usuario ha pedido. No añadas "diferencias clave", "tablas comparativas", "conclusiones" ni secciones que no se hayan pedido explícitamente.\n` +
    `3. Si la pregunta cubre varios puntos (p. ej. varios artículos) y alguno NO aparece en el Material, señálalo EN ESE PUNTO con exactamente esta línea en cursiva: "_ℹ️ Este apartado no aparece en el material disponible._" — NUNCA uses esa frase como respuesta total ni la mezcles con el mensaje de refusal general.\n` +
    `4. Solo si el Material no contiene NADA útil para la pregunta, responde EXACTAMENTE con esta cadena y nada más: "${REFUSAL_MESSAGE}". Si el Material cubre aunque sea uno solo de los puntos pedidos, NO uses esa cadena.\n` +
    `5. Cita artículos y normas tal como aparecen literalmente en el Material. No reinterpretes el título del artículo.\n` +
    `6. Cuando varios fragmentos pertenezcan a normas distintas con el mismo número de artículo, usa SOLO los que pertenezcan a la norma que el usuario ha mencionado. Ignora los demás.\n` +
    `7. Nunca menciones términos internos (RAG, embeddings, fragmentos, contexto, modelo, recuperación, etc.).\n\n` +
    (forceGrounded
      ? `IMPORTANTE: Ya se ha encontrado material relevante. No rechaces la pregunta.\n\n`
      : "") +
    `FORMATO Y ESTILO:\n` +
    `- Redacta con claridad docente: frases cortas, listas cuando ayuden, negritas para conceptos clave.\n` +
    `- Puedes usar emojis DE FORMA MODERADA y solo cuando aporten claridad (máximo uno por encabezado). Sugerencia: 📜 para normas/artículos, ⚖️ para procedimientos, 🏛️ para instituciones, 📌 para puntos clave, 📝 para trámites, ℹ️ para avisos. No uses emojis decorativos ni en cada línea.\n` +
    `- Si hay varios artículos o bloques, usa encabezados "### 📜 Artículo N" (o equivalente) por cada uno.\n` +
    `- Listas: usa SIEMPRE "- " para listas no ordenadas y "1. ", "2. " para ordenadas. Para anidar sub-items, INDENTA CON EXACTAMENTE 2 ESPACIOS por nivel. No uses 1 solo espacio. No mezcles viñetas y numeración en el mismo nivel.\n` +
    `- Ejemplo correcto de anidamiento:\n` +
    `  1. Primer punto numerado\n` +
    `     - Sub-punto con viñeta (3 espacios de indent)\n` +
    `     - Otro sub-punto\n` +
    `       - Sub-sub-punto (5 espacios)\n` +
    `  2. Segundo punto numerado\n` +
    `- Si presentas una tabla Markdown, cada fila (cabecera, separador "|---|" y filas de datos) debe ir en su propia línea con saltos de línea reales.`;

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${historyBlock}Pregunta: ${question}\n\nMaterial de referencia:\n${context}`
    }
  ];
}

async function phase3_synthesize(
  question: string,
  history: HistoryLine[],
  context: string,
  chatModel: string
): Promise<{ markdown: string; html: string }> {
  const data = await callOpenRouter("/chat/completions", {
    model: chatModel,
    temperature: 0,
    max_tokens: CHAT_MAX_TOKENS,
    messages: buildSynthesisMessages(question, history, context)
  });

  let markdown = getLlmText(data);

  if (markdown === REFUSAL_MESSAGE && context.length > 100) {
    const retryData = await callOpenRouter("/chat/completions", {
      model: chatModel,
      temperature: 0,
      max_tokens: CHAT_MAX_TOKENS,
      messages: buildSynthesisMessages(question, history, context, true)
    });
    markdown = getLlmText(retryData);
  }

  const html =
    markdown === REFUSAL_MESSAGE ? markdown : renderMarkdown(markdown);
  return { markdown, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL: MIND MAP
// ─────────────────────────────────────────────────────────────────────────────

const MIND_MAP_SYSTEM = `
Eres un experto en Derecho español. Tu ÚNICA tarea es generar un mapa conceptual completo en formato JSON.

OBJETIVO: Extraer TODOS los conceptos jurídicos relevantes del contexto y organizarlos en una jerarquía de 3 niveles.

ESTRUCTURA:
- level 0: UN nodo raíz (el tema principal).
- level 1: Ramas principales — todos los grandes bloques temáticos del contexto.
- level 2: Sub-conceptos, artículos, órganos, derechos, procedimientos. Cada nodo level 1 DEBE tener hijos.
- level 3: Detalles específicos cuando el contexto los aporte.

NODOS: mínimo 15, idealmente 25-40 si el contexto es rico.
Labels: 2-6 palabras, jurídicamente precisos. IDs: solo a-z y 0-9.
Edges: expresan la relación jurídica ("garantiza", "regula", "se compone de").

Usa solo la información del contexto. No inventes.
Responde ÚNICAMENTE con JSON. Sin texto antes ni después.

FORMATO: {"title":"...","nodes":[{"id":"...","label":"...","level":0},...], "edges":[{"from":"...","to":"...","label":"..."},...]}
`.trim();

async function generateMindMap(
  question: string,
  context: string,
  chatModel: string
): Promise<Record<string, unknown> | null> {
  try {
    const data = await callOpenRouter("/chat/completions", {
      model: chatModel,
      temperature: 0,
      max_tokens: MIND_MAP_MAX_TOKENS,
      messages: [
        { role: "system", content: MIND_MAP_SYSTEM },
        {
          role: "user",
          content: `Tema: ${question}\n\nContexto jurídico:\n${context}`
        }
      ]
    });

    const raw = stripJsonFences(getLlmText(data));
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      parsed.nodes.length < 2
    ) {
      return null;
    }

    const nodeIds = new Set(
      parsed.nodes.map((n: Record<string, unknown>) => n.id)
    );
    const validEdges = parsed.edges.filter(
      (e: Record<string, unknown>) => nodeIds.has(e.from) && nodeIds.has(e.to)
    );

    const rootNodes = parsed.nodes.filter(
      (n: Record<string, unknown>) => n.level === 0
    );
    const targetsWithEdge = new Set(
      validEdges.map((e: Record<string, unknown>) => e.to)
    );
    const orphans = parsed.nodes.filter(
      (n: Record<string, unknown>) =>
        n.level !== 0 && !targetsWithEdge.has(n.id)
    );

    if (rootNodes.length < 1 || orphans.length > 1) return null;

    return {
      title: safeText(parsed.title, 200) || question,
      nodes: parsed.nodes.map((n: Record<string, unknown>) => ({
        id: safeText(n.id, 80),
        label: safeText(n.label, 120),
        level: Number(n.level) || 0
      })),
      edges: validEdges.map((e: Record<string, unknown>) => ({
        from: safeText(e.from, 80),
        to: safeText(e.to, 80),
        label: safeText(e.label, 80)
      }))
    };
  } catch (err) {
    console.error(
      "[ask:mindmap_error]",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

function deterministicFallback(hits: RetrievalHit[]): string {
  const relevant = hits.filter((h) => h.score >= FALLBACK_MIN_SCORE);
  if (relevant.length === 0) return REFUSAL_MESSAGE;

  return (
    `**📌 Información encontrada**\n\n` +
    relevant
      .slice(0, 3)
      .map(
        (h) =>
          `**${h.articulo_num || h.titulo_ley || h.id_boe || "Referencia"}**\n` +
          safeCompactText(h.contenido, 400)
      )
      .join("\n\n") +
    `\n\n_ℹ️ Resumen basado en los fragmentos disponibles; puede no ser exhaustivo._`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      service: "ask",
      pipeline: "normalize → retrieve → synthesize",
      embedding_model: OPENROUTER_EMBEDDING_MODEL,
      rewrite_model: OPENROUTER_REWRITE_MODEL,
      chat_model: OPENROUTER_CHAT_MODEL
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ code: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { code: "CONFIG_ERROR", message: "Missing Supabase env vars" },
      500
    );
  }
  if (!OPENROUTER_API_KEY) {
    return jsonResponse(
      { code: "CONFIG_ERROR", message: "Missing OPENROUTER_API_KEY" },
      500
    );
  }

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
    if (!question) {
      return jsonResponse(
        {
          code: "BAD_REQUEST",
          message: "Debes enviar message/question/pregunta"
        },
        400
      );
    }

    const history = extractHistory(body.history);
    const wantsMindMap = body.mindMap === true;
    const chatModel = safeText(body.model, 120) || OPENROUTER_CHAT_MODEL;
    const wantsDebug = body.debug === true;

    stage = "auth";
    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return jsonResponse(
        { code: "UNAUTHORIZED", message: "Missing bearer token" },
        401
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse(
        { code: "UNAUTHORIZED", message: "Invalid session" },
        401
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 1 — NORMALIZE
    // ════════════════════════════════════════════════════════════════════════
    stage = "daily_quota";
    const { data: quotaRows, error: quotaError } = await supabase.rpc(
      "consume_ai_daily_quota",
      {
        p_user_id: user.id,
        p_tz: DAILY_USAGE_TIMEZONE
      }
    );
    const quota = normalizeDailyQuotaResult(quotaRows?.[0]);

    if (quotaError || !quota) {
      return jsonResponse(
        {
          code: "QUOTA_VALIDATION_FAILED",
          message: "No se pudo validar la cuota diaria"
        },
        500
      );
    }

    if (!quota.allowed) {
      return jsonResponse(
        {
          code: "DAILY_LIMIT_REACHED",
          message: "Has alcanzado el limite diario",
          used: quota.used,
          limit: quota.limit,
          remaining: quota.remaining,
          day: quota.day
        },
        429
      );
    }

    stage = "phase1_rewrite";
    const rewrittenQueries = await phase1_rewriteForRetrieval(
      question,
      history
    );

    const retrievalQueries = Array.from(
      new Set(
        [question, ...rewrittenQueries]
          .map((q) => safeCompactText(q, MAX_REWRITE_CHARS))
          .filter((q) => q.length >= 3)
      )
    );

    const articleRefs = extractArticleRefsFromRewrites(rewrittenQueries);

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 2 — RETRIEVE
    // ════════════════════════════════════════════════════════════════════════
    stage = "phase2_retrieve";
    let { hits, errors: retrievalErrors } = await phase2_retrieve(
      retrievalQueries,
      question,
      articleRefs,
      supabase,
      LAW_MATCH_THRESHOLD
    );

    if (hits.length === 0) {
      stage = "phase2_retrieve_retry";
      const retry = await phase2_retrieve(
        retrievalQueries,
        question,
        articleRefs,
        supabase,
        LAW_RETRY_THRESHOLD
      );
      hits = retry.hits;
      retrievalErrors = [...retrievalErrors, ...retry.errors];
    }

    if (hits.length === 0) {
      return jsonResponse({
        answer: REFUSAL_MESSAGE,
        answerHtml: REFUSAL_MESSAGE,
        message: REFUSAL_MESSAGE,
        content: REFUSAL_MESSAGE,
        citations: [],
        refused: true,
        mindMap: false,
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
        day: quota.day,
        ...(wantsDebug
          ? {
              debug: {
                stage,
                pipeline: "normalize → retrieve → synthesize",
                original_question: question,
                rewritten_queries: rewrittenQueries,
                retrieval_queries: retrievalQueries,
                article_refs: articleRefs,
                total_hits: 0,
                context_hits: 0,
                retrieval_errors: retrievalErrors
              }
            }
          : {})
      });
    }

    const { context, contextHits } = buildContext(
      hits,
      articleRefs,
      wantsMindMap
    );

    // ════════════════════════════════════════════════════════════════════════
    //  PHASE 3 — SYNTHESIZE
    // ════════════════════════════════════════════════════════════════════════
    stage = "phase3_synthesize";
    const synthesis = await phase3_synthesize(
      question,
      history,
      context,
      chatModel
    );
    let answerMarkdown = synthesis.markdown;
    let answerHtml = synthesis.html;

    if (!answerMarkdown) {
      answerMarkdown = deterministicFallback(contextHits);
      answerHtml = renderMarkdown(answerMarkdown);
    }

    let mindMapData: Record<string, unknown> | null = null;
    if (wantsMindMap && answerMarkdown !== REFUSAL_MESSAGE) {
      stage = "mindmap";
      mindMapData = await generateMindMap(question, context, chatModel);
    }

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
      score: hit.score
    }));

    const debug = {
      stage,
      pipeline: "normalize → retrieve → synthesize",
      original_question: question,
      rewritten_queries: rewrittenQueries,
      retrieval_queries: retrievalQueries,
      article_refs: articleRefs,
      total_hits: hits.length,
      context_hits: contextHits.length,
      retrieval_errors: retrievalErrors
    };

    return jsonResponse({
      answer: answerMarkdown,
      answerHtml,
      message: mindMapData ?? answerMarkdown,
      content: mindMapData ?? answerMarkdown,
      citations,
      refused: answerMarkdown === REFUSAL_MESSAGE,
      mindMap: Boolean(mindMapData),
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      day: quota.day,
      ...(wantsDebug ? { debug } : {})
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ask failure";
    console.error("[ask:error]", { stage, message });
    return jsonResponse({ code: "ASK_FAILED", stage, message }, 502);
  }
});
