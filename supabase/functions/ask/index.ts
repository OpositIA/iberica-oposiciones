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
const LAW_RETRY_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_LAW_RETRY_THRESHOLD") ?? "0.14"
);
const LAW_MATCH_COUNT = Math.max(
  8,
  Number(Deno.env.get("ASK_LAW_MATCH_COUNT") ?? "18")
);
const ARTICLE_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_ARTICLE_MATCH_THRESHOLD") ?? "0.16"
);
const ARTICLE_RETRY_MATCH_THRESHOLD = Number(
  Deno.env.get("ASK_ARTICLE_RETRY_THRESHOLD") ?? "0.08"
);
const ARTICLE_MATCH_COUNT = Math.max(
  8,
  Number(Deno.env.get("ASK_ARTICLE_MATCH_COUNT") ?? "18")
);
const MAX_CONTEXT_HITS = Math.max(
  6,
  Number(Deno.env.get("ASK_MAX_CONTEXT_HITS") ?? "9")
);
const CHAT_MAX_TOKENS = Math.max(
  400,
  Number(Deno.env.get("ASK_CHAT_MAX_TOKENS") ?? "700")
);
const MAX_MESSAGE_CHARS = 3000;

const REFUSAL_MESSAGE =
  "No lo encuentro en el material aportado. Para afinar la busqueda, indicame la norma, el articulo o el tema concreto.";

type HistoryLine = { role: "user" | "assistant" | "system"; text: string };
type ArticleRef = { normalized: string; base: string; variants: string[] };
type ArticleQuery = { requested: string; filter: string; query: string };
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
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const safeText = (value: unknown, max = 12000) =>
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
const normalizeAnswerText = (value: unknown, max = 12000) =>
  safeText(value, max)
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
const normalizeArticleToken = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/\bart(?:iculo)?s?\.?\s*/g, "")
    .replace(/[\u00BA\u00AA]/g, "")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z.]/g, "")
    .trim();
const bearer = (authHeader: string | null) =>
  authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";

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
                  .map((part) =>
                    safeText((part as Record<string, unknown>)?.text, 800)
                  )
                  .join("\n")
              : (row.content ?? row.text),
            1400
          );
          return text ? { role, text } : null;
        })
        .filter((item): item is HistoryLine => Boolean(item))
        .slice(-6)
    : [];

const extractArticleRefs = (question: string): ArticleRef[] => {
  const refs = new Map<string, ArticleRef>();
  const regex =
    /\bart(?:iculo)?s?\.?\s*(\d+(?:[.,]\d+)?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)/gi;
  let match: RegExpExecArray | null = regex.exec(stripAccents(question));
  while (match) {
    const normalized = normalizeArticleToken(match[1]);
    if (normalized && !refs.has(normalized)) {
      const base = normalized.match(/^\d+/)?.[0] ?? "";
      refs.set(normalized, {
        normalized,
        base,
        variants: Array.from(new Set([normalized, base].filter(Boolean)))
      });
    }
    match = regex.exec(stripAccents(question));
  }
  return Array.from(refs.values());
};

const extractBoeRefs = (question: string) => {
  const boes = question.match(/\bBOE-[A-Z]-\d{4}-\d+\b/gi) ?? [];
  return Array.from(new Set(boes.map((value) => value.toUpperCase())));
};

const inferLawAlias = (question: string) => {
  const normalized = ` ${normalizeLooseText(question)} `;
  if (
    normalized.includes(" lgt ") ||
    normalized.includes(" general tributaria ")
  ) {
    return { boeId: "BOE-A-2003-23186", hint: "ley general tributaria lgt" };
  }
  return null;
};

const buildQueries = (
  question: string,
  history: HistoryLine[],
  articleRefs: ArticleRef[],
  boeFilter: string | null,
  lawHint: string
) => {
  const historyTail = history
    .slice(-2)
    .map((line) => `${line.role}: ${line.text}`)
    .join("\n");
  const contextual =
    historyTail && question.split(/\s+/).length <= 8
      ? `${historyTail}\n${question}`
      : question;
  const semantic = safeText(
    [
      contextual,
      boeFilter ? `norma ${boeFilter}` : "",
      lawHint,
      articleRefs.length
        ? `articulos ${articleRefs.map((ref) => ref.normalized).join(" ")}`
        : ""
    ]
      .filter(Boolean)
      .join(" "),
    900
  );
  const articleQueries: ArticleQuery[] = [];
  for (const ref of articleRefs.slice(0, 4)) {
    for (const variant of ref.variants.slice(0, 2)) {
      articleQueries.push({
        requested: ref.normalized,
        filter: variant,
        query: safeText(
          [
            `articulo ${variant}`,
            boeFilter ? `norma ${boeFilter}` : "",
            lawHint,
            question
          ]
            .filter(Boolean)
            .join(" "),
          600
        )
      });
    }
  }
  const allQueries = Array.from(
    new Set(
      [semantic, ...articleQueries.map((item) => item.query)].filter(Boolean)
    )
  );
  return {
    semanticQueries: semantic ? [semantic] : [],
    articleQueries,
    allQueries
  };
};

function extractErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  return safeText(record.message ?? record.error, 500) || fallback;
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

const normalizeRpcRows = (
  rows: Array<Record<string, unknown>>,
  source: "buscar_ley" | "buscar_articulos"
): RetrievalHit[] =>
  rows
    .map((row) => {
      let similarity = Number(row.similarity ?? row.rank ?? row.score);
      if (!Number.isFinite(similarity))
        similarity = safeText(row.contenido, 100) ? 0 : Number.NaN;
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
    .filter((row): row is RetrievalHit => Boolean(row));

async function runTasks<T>(tasks: Array<() => Promise<T>>, kind: string) {
  const settled = await Promise.allSettled(tasks.map((task) => task()));
  const values: T[] = [];
  const errors: string[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") values.push(result.value);
    else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : `Unknown ${kind} failure`;
      console.error("[ask:retrieval_error]", { kind, message });
      errors.push(message);
    }
  }
  return { values, errors };
}

const detectArticleMatch = (hit: RetrievalHit, ref: ArticleRef) => {
  const article = normalizeArticleToken(hit.articulo_num ?? "");
  const unitId = normalizeCompactText(hit.unit_id ?? "");
  const path = normalizeCompactText(hit.apartado_path ?? "");
  if (
    article === ref.normalized ||
    unitId === `a${ref.normalized}` ||
    path === `a${ref.normalized}`
  )
    return "exact";
  if (
    ref.base &&
    (article === ref.base ||
      article.startsWith(`${ref.base}.`) ||
      unitId.includes(ref.base) ||
      path.includes(ref.base))
  )
    return "base";
  return "none";
};

const mergeHits = (
  question: string,
  semanticHits: RetrievalHit[],
  articleHits: Array<ArticleQuery & { hits: RetrievalHit[] }>,
  articleRefs: ArticleRef[],
  boeFilter: string | null
) => {
  const merged = new Map<string, RetrievalHit>();
  const tokens = Array.from(
    new Set(
      normalizeLooseText(question)
        .split(" ")
        .filter((token) => token.length >= 4)
    )
  );
  const score = (hit: RetrievalHit) => {
    const text = normalizeLooseText(
      [hit.titulo_ley, hit.articulo_num, hit.apartado_path, hit.contenido]
        .filter(Boolean)
        .join(" ")
    );
    const overlap =
      tokens.length === 0
        ? 0
        : tokens.filter((token) => text.includes(token)).length / tokens.length;
    const articleBoost = articleRefs.reduce(
      (max, ref) =>
        Math.max(
          max,
          detectArticleMatch(hit, ref) === "exact"
            ? 0.42
            : detectArticleMatch(hit, ref) === "base"
              ? 0.16
              : 0
        ),
      0
    );
    const nextScore =
      hit.similarity +
      Math.min(0.18, overlap * 0.18) +
      articleBoost +
      (boeFilter && hit.id_boe === boeFilter ? 0.12 : 0) +
      (hit.source === "buscar_articulos" ? 0.04 : 0);
    return {
      ...hit,
      score: nextScore,
      article_matches: articleRefs
        .filter((ref) => detectArticleMatch(hit, ref) !== "none")
        .map((ref) => ref.normalized)
    };
  };
  for (const hit of semanticHits) {
    const next = score(hit);
    merged.set(`${next.id}|${next.unit_id}|${next.articulo_num}`, next);
  }
  for (const articleResult of articleHits) {
    for (const hit of articleResult.hits) {
      const next = score({ ...hit, source: "buscar_articulos" });
      const key = `${next.id}|${next.unit_id}|${next.articulo_num}`;
      const prev = merged.get(key);
      if (!prev || next.score > prev.score) merged.set(key, next);
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.score - a.score || b.similarity - a.similarity
  );
};

const buildMessages = (
  question: string,
  history: HistoryLine[],
  notes: string[],
  context: string,
  forceGrounded = false
) => [
  {
    role: "system",
    content:
      `Respondes SOLO con el contexto juridico recuperado. No uses conocimiento externo.\n` +
      `Solo puedes responder exactamente "${REFUSAL_MESSAGE}" si el contexto esta vacio.\n` +
      `Si hay contexto, responde siempre lo que si este respaldado y explica limites.\n` +
      `Cita la norma, articulo o epigrafe.\n` +
      (forceGrounded
        ? `Una negativa total seria incorrecta porque ya hay fragmentos recuperados.\n`
        : "") +
      `Formato:\n**Respuesta**\n...\n\n**Base legal o tematica**\n...\n\n**Limites**\n...`
  },
  {
    role: "user",
    content:
      `Historial auxiliar:\n${history.map((item) => `${item.role}: ${item.text}`).join("\n") || "(sin historial)"}\n\n` +
      `Notas de recuperacion:\n${notes.join("\n") || "(sin notas)"}\n\n` +
      `Pregunta:\n${question}\n\n` +
      `Contexto juridico recuperado:\n${context || "(sin contexto recuperado)"}`
  }
];

const MIND_MAP_MAX_TOKENS = Math.max(
  1200,
  Number(Deno.env.get("ASK_MIND_MAP_MAX_TOKENS") ?? "4000")
);

const buildMindMapMessages = (question: string, context: string) => [
  {
    role: "system",
    content:
      `Eres un experto en Derecho español. Tu UNICA tarea es generar un mapa conceptual completo y detallado en formato JSON.\n\n` +
      `OBJETIVO: Extraer TODOS los conceptos juridicos relevantes del contexto y organizarlos en una jerarquia clara de 3 niveles de profundidad.\n\n` +
      `ESTRUCTURA OBLIGATORIA:\n` +
      `- level 0: UN solo nodo raiz (el tema principal).\n` +
      `- level 1: Ramas principales — todos los grandes bloques tematicos que aparezcan en el contexto. Usa tantos como necesites para cubrir el contenido completo.\n` +
      `- level 2: Desarrollo de cada rama — sub-conceptos, detalles, articulos relevantes, organos, derechos o procedimientos concretos que el contexto mencione. Cada nodo de level 1 DEBE tener hijos de level 2.\n` +
      `- level 3: Detalles especificos cuando el contexto aporte informacion suficiente (condiciones, excepciones, requisitos, plazos, composicion de organos, etc.).\n\n` +
      `CANTIDAD DE NODOS:\n` +
      `- El mapa debe ser COMPLETO y reflejar la riqueza del contexto proporcionado.\n` +
      `- Minimo esperable: 15 nodos. Si el contexto es rico, genera 25-40 nodos sin problema.\n` +
      `- No te limites artificialmente. Si hay informacion en el contexto, debe aparecer en el mapa.\n\n` +
      `CALIDAD:\n` +
      `- Cada nodo = un CONCEPTO JURIDICO SUSTANTIVO (principios, derechos, organos, procedimientos, deberes, competencias).\n` +
      `- EXCLUYE metadatos: fechas de BOE, entrada en vigor, numeros de publicacion.\n` +
      `- EXCLUYE nodos vacios o genericos (\"Otros\", \"Varios\", \"Miscelanea\").\n` +
      `- Labels de nodo: concisos, 2-6 palabras, juridicamente precisos.\n` +
      `- Labels de edges: 2-6 palabras expresando la relacion juridica (\"garantiza\", \"regula\", \"se compone de\", \"reconoce\", \"limita\").\n` +
      `- IDs: solo minusculas a-z y digitos 0-9, sin espacios ni acentos.\n` +
      `- Todo nodo (excepto raiz) debe tener al menos un edge entrante.\n\n` +
      `USA SOLO la informacion del contexto juridico proporcionado. No inventes.\n` +
      `Genera UNICAMENTE el JSON, sin texto antes ni despues, sin bloques markdown.\n\n` +
      `FORMATO:\n` +
      `{"title":"...","nodes":[{"id":"...","label":"...","level":0},...],"edges":[{"from":"...","to":"...","label":"..."},...]}`
  },
  {
    role: "user",
    content:
      `Tema del mapa: ${question}\n\n` +
      `Contexto juridico recuperado:\n${context || "(sin contexto)"}`
  }
];

const buildDeterministicFallback = (hits: RetrievalHit[]) =>
  `**Respuesta**\nHe recuperado fragmentos relevantes, pero el modelo no los ha sintetizado con fiabilidad. Te dejo solo la base que consta en RAG:\n` +
  `${hits
    .slice(0, 3)
    .map(
      (hit) =>
        `- ${hit.articulo_num || hit.titulo_ley || hit.id_boe || "Fragmento"}: ${safeCompactText(hit.contenido, 320)}`
    )
    .join("\n")}\n\n` +
  `**Base legal o tematica**\n${hits
    .slice(0, 3)
    .map(
      (hit) =>
        `- ${hit.articulo_num || hit.titulo_ley || hit.id_boe || "Fragmento"}`
    )
    .join("\n")}\n\n` +
  `**Limites**\nLa respuesta queda restringida a esos fragmentos y puede no cubrir toda la pregunta.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET")
    return json({
      ok: true,
      service: "ask",
      search_mode: "rag_only",
      embedding_model: OPENROUTER_EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM
    });
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

    const history = extractHistory(body.history);
    const articleRefs = extractArticleRefs(question);
    const boeRefs = extractBoeRefs(question);
    const inferredLaw = inferLawAlias(question);
    const boeFilter = boeRefs[0] ?? inferredLaw?.boeId ?? null;
    const lawHint = inferredLaw?.hint ?? "";
    const { semanticQueries, articleQueries, allQueries } = buildQueries(
      question,
      history,
      articleRefs,
      boeFilter,
      lawHint
    );

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
    if (!Array.isArray(embData) || embData.length !== allQueries.length)
      throw new Error("Embeddings payload invalido");
    const embeddingsByQuery = new Map<string, number[]>();
    for (let index = 0; index < allQueries.length; index += 1) {
      const item = embData[index] as Record<string, unknown> | undefined;
      embeddingsByQuery.set(
        allQueries[index],
        Array.isArray(item?.embedding)
          ? item.embedding.map((value) => Number(value))
          : []
      );
    }

    const runPass = async (lawThreshold: number, articleThreshold: number) => {
      const semanticTasks = semanticQueries.map((query) => async () => {
        const { data, error } = await supabase.rpc("buscar_ley", {
          query_embedding: embeddingsByQuery.get(query),
          match_threshold: lawThreshold,
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
      const articleTasks = articleQueries.map((item) => async () => {
        const { data, error } = await supabase.rpc("buscar_articulos", {
          query_embedding: embeddingsByQuery.get(item.query),
          match_threshold: articleThreshold,
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
      const semanticResults = await runTasks(semanticTasks, "buscar_ley");
      const articleResults = await runTasks(articleTasks, "buscar_articulos");
      return {
        semanticResults: semanticResults.values.flat(),
        articleResults: articleResults.values,
        retrievalErrors: [...semanticResults.errors, ...articleResults.errors]
      } as RetrievalPassResult;
    };

    stage = "rpc_primary_retrieval";
    let pass = await runPass(LAW_MATCH_THRESHOLD, ARTICLE_MATCH_THRESHOLD);
    let ranked = mergeHits(
      question,
      pass.semanticResults,
      pass.articleResults,
      articleRefs,
      boeFilter
    );
    if (ranked.length === 0) {
      stage = "rpc_retry_retrieval";
      const retryPass = await runPass(
        LAW_RETRY_MATCH_THRESHOLD,
        ARTICLE_RETRY_MATCH_THRESHOLD
      );
      pass = {
        semanticResults: [
          ...pass.semanticResults,
          ...retryPass.semanticResults
        ],
        articleResults: [...pass.articleResults, ...retryPass.articleResults],
        retrievalErrors: [...pass.retrievalErrors, ...retryPass.retrievalErrors]
      };
      ranked = mergeHits(
        question,
        pass.semanticResults,
        pass.articleResults,
        articleRefs,
        boeFilter
      );
    }

    const wantsMindMap = body.mindMap === true;
    const contextHits = ranked.slice(
      0,
      wantsMindMap ? Math.max(MAX_CONTEXT_HITS, 14) : MAX_CONTEXT_HITS
    );
    const notes = articleRefs
      .filter(
        (ref) =>
          !contextHits.some((hit) => detectArticleMatch(hit, ref) !== "none")
      )
      .map(
        (ref) =>
          `No se recupero una coincidencia clara para el articulo ${ref.normalized}; la respuesta debe limitarse a los fragmentos disponibles.`
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
        semantic_raw: pass.semanticResults.length,
        article_raw: pass.articleResults.reduce(
          (acc, item) => acc + item.hits.length,
          0
        ),
        ranked: ranked.length,
        context: contextHits.length
      },
      retrieval_errors: pass.retrievalErrors,
      notes
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

    let budget = wantsMindMap ? 36000 : 22000;
    const context = contextHits
      .map((hit, index) => {
        if (budget <= 0) return "";
        const content = safeText(
          hit.contenido,
          Math.min(
            hit.article_matches.length > 0 ? 3200 : wantsMindMap ? 2800 : 1500,
            Math.max(0, budget - 350)
          )
        );
        const block =
          `Contexto ${index + 1}\n` +
          `Titulo: ${hit.articulo_num || hit.titulo_ley || `Fragmento ${index + 1}`}\n` +
          `${[hit.titulo_ley ? `Norma: ${hit.titulo_ley}` : "", hit.unit_id ? `Unidad: ${hit.unit_id}` : "", hit.apartado_path ? `Ruta: ${hit.apartado_path}` : "", hit.eli ? `ELI: ${hit.eli}` : ""].filter(Boolean).join(" | ")}\n` +
          `Contenido:\n${content}`;
        budget = Math.max(0, budget - block.length);
        return block;
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    const model = safeText(body.model, 120) || OPENROUTER_CHAT_MODEL;
    stage = "chat_request";
    const llm = await callOpenRouter("/chat/completions", {
      model,
      temperature: 0,
      max_tokens: CHAT_MAX_TOKENS,
      messages: buildMessages(question, history, notes, context)
    });

    stage = "chat_parse";
    let answer = normalizeAnswerText(
      (
        (llm as Record<string, unknown>).choices as
          | Array<Record<string, unknown>>
          | undefined
      )?.[0]?.message?.content,
      12000
    );
    if (answer === REFUSAL_MESSAGE) {
      stage = "chat_retry_grounded";
      const retryLlm = await callOpenRouter("/chat/completions", {
        model,
        temperature: 0,
        max_tokens: CHAT_MAX_TOKENS,
        messages: buildMessages(question, history, notes, context, true)
      });
      answer = normalizeAnswerText(
        (
          (retryLlm as Record<string, unknown>).choices as
            | Array<Record<string, unknown>>
            | undefined
        )?.[0]?.message?.content,
        12000
      );
    }
    if (!answer || answer === REFUSAL_MESSAGE)
      answer = buildDeterministicFallback(contextHits);

    let mindMapData: Record<string, unknown> | null = null;

    if (wantsMindMap && answer !== REFUSAL_MESSAGE) {
      stage = "mindmap_request";
      try {
        const mindMapLlm = await callOpenRouter("/chat/completions", {
          model,
          temperature: 0,
          max_tokens: MIND_MAP_MAX_TOKENS,
          messages: buildMindMapMessages(question, context)
        });

        stage = "mindmap_parse";
        let rawMindMap = normalizeAnswerText(
          (
            (mindMapLlm as Record<string, unknown>).choices as
              | Array<Record<string, unknown>>
              | undefined
          )?.[0]?.message?.content,
          20000
        );

        // Strip markdown code fences if the model wraps JSON in ```
        rawMindMap = rawMindMap
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();

        const parsed = JSON.parse(rawMindMap);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.nodes) &&
          Array.isArray(parsed.edges) &&
          parsed.nodes.length >= 2
        ) {
          // Validate: every non-root node has an incoming edge
          const nodeIds = new Set(
            parsed.nodes.map((n: Record<string, unknown>) => n.id)
          );
          const targetsWithEdge = new Set(
            parsed.edges.map((e: Record<string, unknown>) => e.to)
          );
          const validEdges = parsed.edges.filter(
            (e: Record<string, unknown>) =>
              nodeIds.has(e.from) && nodeIds.has(e.to)
          );

          const rootNodes = parsed.nodes.filter(
            (n: Record<string, unknown>) => n.level === 0
          );
          const orphans = parsed.nodes.filter(
            (n: Record<string, unknown>) =>
              n.level !== 0 && !targetsWithEdge.has(n.id)
          );

          // Accept if structure is reasonably valid
          if (rootNodes.length >= 1 && orphans.length <= 1) {
            mindMapData = {
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
          }
        }
      } catch (mindMapError) {
        console.error("[ask:mindmap_error]", {
          message:
            mindMapError instanceof Error
              ? mindMapError.message
              : "Unknown mindmap failure"
        });
        // Mind map generation is non-critical; proceed with text answer
      }
    }

    return json({
      answer,
      message: mindMapData ?? answer,
      content: mindMapData ?? answer,
      citations,
      refused: answer === REFUSAL_MESSAGE,
      mindMap: Boolean(mindMapData),
      ...(body.debug === true ? { debug } : {})
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ask failure";
    console.error("[ask:error]", { stage, message });
    return json({ code: "ASK_FAILED", stage, message }, 502);
  }
});
