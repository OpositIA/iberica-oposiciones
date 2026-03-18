/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type Difficulty = "facil" | "media" | "dificil";
type Scope = "block" | "topic";
type OptionId = "A" | "B" | "C" | "D";

type RequestBody = {
  opposition_id: string;
  opposition_name?: string;
  locale?: "es";
  difficulty: Difficulty;
  count?: number;
  scope?: Scope;
  target_type?: Scope;
  targetType?: Scope;
  block?: { id?: string; label?: string };
  block_id?: string;
  blockId?: string;
  block_label?: string;
  blockLabel?: string;
  topic?: { id?: string; label?: string };
  topic_id?: string;
  topicId?: string;
  topic_label?: string;
  topicLabel?: string;
  match_threshold?: number;
  match_count?: number;
  context_chars?: number;
  avoid_recent_bank_tests?: number;
};

type TopicRow = { id: number; topic_code: string; topic_title: string | null };
type SubtopicRow = {
  id: number;
  opposition_topic_id: number;
  subtopic_code: string;
  subtopic_title: string | null;
  section_title: string | null;
};

type Chunk = {
  chunkId: string;
  idBoe: string;
  article: string | null;
  reference: string | null;
  unitType: string | null;
  score: number | null;
  title: string | null;
  snippet: string | null;
  content: string;
  rawChunk: unknown;
};

type Citation = {
  chunkId: string;
  idBoe: string;
  article: string;
  reference: string;
};
type NormalizedOption = { id: OptionId; text: string };
type Question = {
  topicId: string;
  topicLabel: string;
  question: string;
  options: NormalizedOption[];
  correctOptionId: OptionId;
  explanation: string;
  citations: Citation[];
};

type Target = {
  scope: Scope;
  targetId: string;
  targetLabel: string;
  blockId: string | null;
  blockLabel: string | null;
  topicId: string | null;
  topicLabel: string | null;
  queryText: string;
  promptInstruction: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const s = (value: unknown) =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";

const key = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function first(...values: unknown[]) {
  for (const value of values) {
    const text = s(value);
    if (text) return text;
  }
  return "";
}

function requireEdgeSecretIfConfigured(req: Request): Response | null {
  const secret = Deno.env.get("EDGE_SECRET");
  if (!secret) return null;
  const got = req.headers.get("x-edge-secret");
  return got === secret
    ? null
    : json({ error: "Unauthorized (x-edge-secret)" }, 401);
}

function safeJsonParse(text: string): any {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace)
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));

    throw new Error("Model did not return valid JSON");
  }
}

async function ollamaChat(baseUrl: string, model: string, prompt: string) {
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content:
            "Eres un generador de preguntas de oposiciones. Devuelves SOLO JSON valido."
        },
        { role: "user", content: prompt }
      ],
      options: { temperature: 0.2, top_p: 0.9, repeat_penalty: 1.1 }
    })
  });
  if (!response.ok)
    throw new Error(
      `Ollama chat error (${response.status}): ${await response.text()}`
    );
  const data = await response.json();
  if (typeof data?.message?.content !== "string")
    throw new Error("No message.content in Ollama response");
  return data.message.content as string;
}

async function embedQuery(text: string) {
  const provider = (Deno.env.get("EMBED_PROVIDER") ?? "ollama").toLowerCase();
  if (provider === "gemini") {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 3072,
          content: { parts: [{ text }] }
        })
      }
    );
    if (!response.ok)
      throw new Error(
        `Gemini embed error (${response.status}): ${await response.text()}`
      );
    const data = await response.json();
    const vector =
      data?.embedding?.values ?? data?.embedding?.value ?? data?.embedding;
    if (!Array.isArray(vector)) throw new Error("No embedding vector found");
    return vector as number[];
  }

  const baseUrl = Deno.env.get("OLLAMA_BASE_URL");
  if (!baseUrl) throw new Error("Missing OLLAMA_BASE_URL");
  const model = Deno.env.get("OLLAMA_EMBED_MODEL") ?? "nomic-embed-text";
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text })
  });
  if (!response.ok)
    throw new Error(
      `Ollama embeddings error (${response.status}): ${await response.text()}`
    );
  const data = await response.json();
  if (!Array.isArray(data?.embedding))
    throw new Error("No embedding in Ollama response");
  return data.embedding as number[];
}

async function loadStructure(
  supabase: ReturnType<typeof createClient>,
  oppositionId: string
) {
  const { data: syllabus, error: syllabusErr } = await supabase
    .from("opposition_syllabi")
    .select("id")
    .eq("opposition_id", oppositionId)
    .eq("is_current", true)
    .maybeSingle();
  if (syllabusErr)
    throw new Error(`Load current syllabus error: ${syllabusErr.message}`);
  if (!syllabus?.id) return null;

  const { data: topicsRaw, error: topicsErr } = await supabase
    .from("opposition_topics")
    .select("id, topic_code, topic_title")
    .eq("syllabus_id", syllabus.id)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });
  if (topicsErr)
    throw new Error(`Load syllabus topics error: ${topicsErr.message}`);
  const topics = (Array.isArray(topicsRaw) ? topicsRaw : []) as TopicRow[];

  const { data: subtopicsRaw, error: subtopicsErr } = topics.length
    ? await supabase
        .from("opposition_subtopics")
        .select(
          "id, opposition_topic_id, subtopic_code, subtopic_title, section_title"
        )
        .in(
          "opposition_topic_id",
          topics.map((row) => row.id)
        )
        .order("order_index", { ascending: true })
        .order("id", { ascending: true })
    : { data: [], error: null };
  if (subtopicsErr)
    throw new Error(`Load syllabus subtopics error: ${subtopicsErr.message}`);
  return {
    topics,
    subtopics: (Array.isArray(subtopicsRaw)
      ? subtopicsRaw
      : []) as SubtopicRow[]
  };
}

function blockLabel(topic: TopicRow, byTopic: Map<number, SubtopicRow[]>) {
  const base =
    s(topic.topic_title) || s(topic.topic_code) || `Bloque ${topic.id}`;
  const section = s(
    byTopic.get(topic.id)?.find((row) => s(row.section_title))?.section_title
  );
  return base && section && !key(base).includes(key(section))
    ? `${base}. ${section}`
    : base || section;
}

function inferScope(body: RequestBody): Scope {
  const explicit = first(body.scope, body.targetType, body.target_type);
  if (explicit === "block" || explicit === "topic") return explicit;
  return first(
    body.block?.id,
    body.block?.label,
    body.blockId,
    body.block_label,
    body.blockLabel
  )
    ? "block"
    : "topic";
}

function resolveTarget(
  body: RequestBody,
  structure: { topics: TopicRow[]; subtopics: SubtopicRow[] } | null
): Target {
  const scope = inferScope(body);
  const oppositionName = first(body.opposition_name, body.opposition_id);
  const rawBlockId = first(body.block?.id, body.blockId, body.block_id);
  const rawBlockLabel = first(
    body.block?.label,
    body.blockLabel,
    body.block_label
  );
  const rawTopicId = first(body.topic?.id, body.topicId, body.topic_id);
  const rawTopicLabel = first(
    body.topic?.label,
    body.topicLabel,
    body.topic_label
  );

  if (!structure) {
    if (scope === "block") {
      const targetId = rawBlockId || rawTopicId;
      const targetLabel = rawBlockLabel || rawTopicLabel;
      if (!targetId || !targetLabel)
        throw new Error("Falta block.id y block.label");
      return {
        scope,
        targetId,
        targetLabel,
        blockId: targetId,
        blockLabel: targetLabel,
        topicId: null,
        topicLabel: null,
        queryText: `${oppositionName} bloque ${targetLabel}`,
        promptInstruction: `La pregunta debe cubrir solo el bloque "${targetLabel}".`
      };
    }
    if (!rawTopicId || !rawTopicLabel)
      throw new Error("Falta topic.id y topic.label");
    return {
      scope,
      targetId: rawTopicId,
      targetLabel: rawTopicLabel,
      blockId: rawBlockId || null,
      blockLabel: rawBlockLabel || null,
      topicId: rawTopicId,
      topicLabel: rawTopicLabel,
      queryText: `${oppositionName} tema ${rawTopicLabel}`,
      promptInstruction: `La pregunta debe cubrir solo el tema "${rawTopicLabel}".`
    };
  }

  const byTopic = new Map<number, SubtopicRow[]>();
  for (const row of structure.subtopics) {
    if (!byTopic.has(row.opposition_topic_id))
      byTopic.set(row.opposition_topic_id, []);
    byTopic.get(row.opposition_topic_id)?.push(row);
  }

  if (scope === "block") {
    const wantedId = key(rawBlockId || rawTopicId);
    const wantedLabel = key(rawBlockLabel || rawTopicLabel);
    const topic =
      structure.topics.find(
        (row) =>
          wantedId &&
          [s(row.topic_code), s(row.id)].some(
            (value) => key(value) === wantedId
          )
      ) ??
      structure.topics.find(
        (row) =>
          wantedLabel &&
          [
            blockLabel(row, byTopic),
            s(row.topic_title),
            s(row.topic_code)
          ].some((value) => key(value) === wantedLabel)
      );
    if (!topic)
      throw new Error(
        `No se encontro el bloque solicitado en ${body.opposition_id}`
      );
    const label = blockLabel(topic, byTopic);
    const childTopics = (byTopic.get(topic.id) ?? [])
      .map((row) => s(row.subtopic_title))
      .filter(Boolean);
    return {
      scope,
      targetId: s(topic.topic_code) || String(topic.id),
      targetLabel: label,
      blockId: s(topic.topic_code) || String(topic.id),
      blockLabel: label,
      topicId: null,
      topicLabel: null,
      queryText: `${oppositionName} ${label} ${childTopics.join(" | ")}`.trim(),
      promptInstruction: `La pregunta debe cubrir solo el bloque "${label}". ${childTopics.length ? `Puede basarse en: ${childTopics.join("; ")}.` : ""}`
    };
  }

  const wantedId = key(rawTopicId);
  const wantedLabel = key(rawTopicLabel);
  const subtopic =
    structure.subtopics.find(
      (row) =>
        wantedId &&
        [s(row.subtopic_code), s(row.id)].some(
          (value) => key(value) === wantedId
        )
    ) ??
    structure.subtopics.find(
      (row) => wantedLabel && key(s(row.subtopic_title)) === wantedLabel
    );
  if (!subtopic)
    throw new Error(
      `No se encontro el tema solicitado en ${body.opposition_id}`
    );
  const topic =
    structure.topics.find((row) => row.id === subtopic.opposition_topic_id) ??
    null;
  const label = s(subtopic.subtopic_title) || rawTopicLabel;
  const parentLabel = topic ? blockLabel(topic, byTopic) : null;
  return {
    scope,
    targetId: s(subtopic.subtopic_code) || String(subtopic.id),
    targetLabel: label,
    blockId: topic ? s(topic.topic_code) || String(topic.id) : null,
    blockLabel: parentLabel,
    topicId: s(subtopic.subtopic_code) || String(subtopic.id),
    topicLabel: label,
    queryText: `${oppositionName} ${parentLabel ?? ""} ${label}`.trim(),
    promptInstruction: `La pregunta debe cubrir solo el tema "${label}". ${parentLabel ? `Pertenece al bloque "${parentLabel}".` : ""}`
  };
}

function trim(text: string, maxChars: number) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars - 1).trimEnd()}...`;
}

function sourcesBlock(chunks: Chunk[], maxChars: number) {
  let out = "";
  for (const chunk of chunks) {
    const piece = [
      `### SOURCE chunkId=${chunk.chunkId} | idBoe=${chunk.idBoe} | article=${chunk.article ?? ""} | reference=${chunk.reference ?? ""}`,
      chunk.title ? `TITLE: ${chunk.title}` : "",
      `EXCERPT: ${trim(chunk.snippet || chunk.content, 1200)}`
    ]
      .filter(Boolean)
      .join("\n");
    if (out.length + piece.length > maxChars) break;
    out += `${out ? "\n\n" : ""}${piece}`;
  }
  return out.trim();
}

function prompt(
  body: RequestBody,
  target: Target,
  chunks: Chunk[],
  recentQuestions: string[]
) {
  const used = recentQuestions.length
    ? recentQuestions
        .slice(-20)
        .map((q) => `- ${trim(q, 170)}`)
        .join("\n")
    : "- (ninguna)";
  return `
Eres preparador de oposiciones en Espana. Devuelves SOLO JSON valido.

OBJETIVO:
- oppositionId: ${body.opposition_id}
- difficulty: ${body.difficulty}
- targetType: ${target.scope}
- targetId: ${target.targetId}
- targetLabel: ${target.targetLabel}

REGLAS:
- Genera EXACTAMENTE 1 pregunta tipo test.
- 4 opciones A/B/C/D.
- 1 unica correcta.
- Debe incluir explanation y citations.
- citations[].chunkId debe ser uno de los chunkId disponibles.
- ${target.promptInstruction}
- No repitas ideas de YA USADAS.

YA USADAS:
${used}

FUENTES:
${sourcesBlock(chunks, body.context_chars ?? 16000)}

DEVUELVE:
{
  "questions": [
    {
      "topicId": "${target.targetId}",
      "topicLabel": "${target.targetLabel}",
      "question": "...",
      "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
      "correctOptionId": "A",
      "explanation": "...",
      "citations": [{"chunkId":"...","idBoe":"...","article":"...","reference":"..."}]
    }
  ]
}
`.trim();
}

function normalizeOptions(raw: unknown): NormalizedOption[] | null {
  const ids: OptionId[] = ["A", "B", "C", "D"];
  if (Array.isArray(raw)) {
    const items = raw.slice(0, 4);
    if (items.length < 4) return null;
    const built = items.map((item, index) => ({
      id: (s((item as any)?.id).toUpperCase() as OptionId) || ids[index],
      text: s((item as any)?.text ?? (item as any)?.label ?? item)
    }));
    if (built.some((item) => !item.text)) return null;
    const byId = new Map(built.map((item) => [item.id, item.text] as const));
    return ids.every((id) => byId.has(id))
      ? ids.map((id) => ({ id, text: byId.get(id)! }))
      : ids.map((id, index) => ({ id, text: built[index].text }));
  }
  return null;
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractOptionIdFromString(raw: string): OptionId | null {
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (!folded) return null;

  const ids: OptionId[] = ["A", "B", "C", "D"];
  if (ids.includes(folded as OptionId)) return folded as OptionId;

  const keywordMatch = folded.match(
    /(?:OPCION|RESPUESTA|CORRECTA|ALTERNATIVA)\s*[:-]?\s*([ABCD])(?:\b|[).])/
  );
  if (keywordMatch?.[1] && ids.includes(keywordMatch[1] as OptionId))
    return keywordMatch[1] as OptionId;

  const compactMatch = folded.match(/(?:^|[^A-Z])([ABCD])\s*[).:-]?\s*$/);
  if (compactMatch?.[1] && ids.includes(compactMatch[1] as OptionId))
    return compactMatch[1] as OptionId;

  const isolatedMatch = folded.match(/\b([ABCD])\b/);
  if (isolatedMatch?.[1] && ids.includes(isolatedMatch[1] as OptionId))
    return isolatedMatch[1] as OptionId;

  return null;
}

function normalizeCorrectOptionId(
  raw: unknown,
  options: NormalizedOption[]
): OptionId {
  const ids: OptionId[] = ["A", "B", "C", "D"];
  if (typeof raw === "string") {
    const parsedId = extractOptionIdFromString(raw);
    if (parsedId) return parsedId;

    const value = raw.trim();
    const idx = options.findIndex(
      (option) => normalizeForMatch(option.text) === normalizeForMatch(value)
    );
    if (idx >= 0) return ids[idx];
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const idx = Math.floor(raw);
    if (idx >= 0 && idx <= 3) return ids[idx];
    if (idx >= 1 && idx <= 4) return ids[idx - 1];
  }

  return "A";
}

function inferCorrectOptionFromExplanation(
  explanation: string,
  options: NormalizedOption[]
): OptionId | null {
  const normalizedExplanation = normalizeForMatch(explanation);
  if (!normalizedExplanation) return null;

  const explanationTokens = new Set(
    normalizedExplanation
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
  );

  const scored = options
    .map((option) => {
      const normalizedOption = normalizeForMatch(option.text);
      if (!normalizedOption) return { id: option.id, score: 0 };

      if (
        normalizedOption.length >= 8 &&
        normalizedExplanation.includes(normalizedOption)
      )
        return { id: option.id, score: 1.5 };

      const optionTokens = normalizedOption
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 4);
      if (!optionTokens.length) return { id: option.id, score: 0 };

      const shared = optionTokens.filter((token) =>
        explanationTokens.has(token)
      ).length;
      return { id: option.id, score: shared / optionTokens.length };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.7) return null;
  if (second && best.score - second.score < 0.15) return null;
  return best.id;
}

function normalizeQuestion(
  raw: unknown,
  chunksById: Map<string, Chunk>,
  fallbackChunk: Chunk,
  target: Target
): Question | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const question = s(
    record.question ??
      record.enunciado ??
      record.statement ??
      record.prompt ??
      record.text
  );
  if (question.length < 12) return null;
  const options = normalizeOptions(
    record.options ?? record.choices ?? record.answers ?? record.alternatives
  );
  if (!options) return null;
  const explanation =
    s(record.explanation ?? record.explicacion ?? record.justification) ||
    "Respuesta basada en el texto legal citado.";
  const parsedCorrectOptionId = normalizeCorrectOptionId(
    record.correctOptionId ??
      record.correct_option_id ??
      record.correct ??
      record.correctAnswer ??
      record.correct_answer,
    options
  );
  const inferredCorrectOptionId = inferCorrectOptionFromExplanation(
    explanation,
    options
  );
  const correctOptionId = inferredCorrectOptionId ?? parsedCorrectOptionId;
  const citationsRaw = Array.isArray(record.citations) ? record.citations : [];
  const citations = citationsRaw
    .map((item) => {
      const chunkId = s(
        (item as any)?.chunkId ?? (item as any)?.chunk_id ?? item
      );
      const chunk =
        (chunkId
          ? (chunksById.get(chunkId) ??
            [...chunksById.values()].find(
              (row) => row.chunkId.toLowerCase() === chunkId.toLowerCase()
            ))
          : null) ?? fallbackChunk;
      return {
        chunkId: chunk.chunkId,
        idBoe: s((item as any)?.idBoe ?? (item as any)?.id_boe ?? chunk.idBoe),
        article: s((item as any)?.article ?? chunk.article),
        reference: s((item as any)?.reference ?? chunk.reference)
      };
    })
    .filter((item) => item.chunkId);
  if (!citations.length)
    citations.push({
      chunkId: fallbackChunk.chunkId,
      idBoe: s(fallbackChunk.idBoe),
      article: s(fallbackChunk.article),
      reference: s(fallbackChunk.reference)
    });

  return {
    topicId: s(record.topicId ?? record.topic_id) || target.targetId,
    topicLabel:
      s(record.topicLabel ?? record.topic_label) || target.targetLabel,
    question,
    options,
    correctOptionId,
    explanation,
    citations
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const secretErr = requireEdgeSecretIfConfigured(req);
  if (secretErr) return secretErr;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ollamaBaseUrl = Deno.env.get("OLLAMA_BASE_URL");
    const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "deepseek-r1:14b";
    if (!supabaseUrl || !serviceRoleKey)
      return json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500
      );
    if (!ollamaBaseUrl) return json({ error: "Missing OLLAMA_BASE_URL" }, 500);

    let parsedBody: RequestBody;
    try {
      parsedBody = await parseJsonBody<RequestBody>(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid JSON body")
        return json({ error: error.message }, 400);

      throw error;
    }
    const body: RequestBody = {
      ...parsedBody,
      opposition_id: sanitizeCode(parsedBody.opposition_id, 120),
      opposition_name: sanitizeSingleLineText(
        parsedBody.opposition_name ?? parsedBody.opposition_id,
        160
      ),
      locale:
        sanitizeCode(parsedBody.locale ?? "es", 8) === "es" ? "es" : undefined,
      difficulty: sanitizeCode(parsedBody.difficulty, 16) as Difficulty,
      count:
        sanitizeInteger(parsedBody.count, { min: 1, max: 100, fallback: 1 }) ??
        1,
      scope:
        parsedBody.scope === "block" || parsedBody.scope === "topic"
          ? parsedBody.scope
          : undefined,
      target_type:
        parsedBody.target_type === "block" || parsedBody.target_type === "topic"
          ? parsedBody.target_type
          : undefined,
      targetType:
        parsedBody.targetType === "block" || parsedBody.targetType === "topic"
          ? parsedBody.targetType
          : undefined,
      block: parsedBody.block
        ? {
            id: sanitizeCode(parsedBody.block.id, 120),
            label: sanitizeSingleLineText(parsedBody.block.label, 160)
          }
        : undefined,
      block_id: sanitizeCode(parsedBody.block_id, 120),
      blockId: sanitizeCode(parsedBody.blockId, 120),
      block_label: sanitizeSingleLineText(parsedBody.block_label, 160),
      blockLabel: sanitizeSingleLineText(parsedBody.blockLabel, 160),
      topic: parsedBody.topic
        ? {
            id: sanitizeCode(parsedBody.topic.id, 120),
            label: sanitizeSingleLineText(parsedBody.topic.label, 160)
          }
        : undefined,
      topic_id: sanitizeCode(parsedBody.topic_id, 120),
      topicId: sanitizeCode(parsedBody.topicId, 120),
      topic_label: sanitizeSingleLineText(parsedBody.topic_label, 160),
      topicLabel: sanitizeSingleLineText(parsedBody.topicLabel, 160),
      match_threshold:
        typeof parsedBody.match_threshold === "number" &&
        Number.isFinite(parsedBody.match_threshold)
          ? clamp(parsedBody.match_threshold, 0, 1)
          : undefined,
      match_count:
        sanitizeInteger(parsedBody.match_count, {
          min: 1,
          max: 120,
          fallback: 80
        }) ?? 80,
      context_chars:
        sanitizeInteger(parsedBody.context_chars, {
          min: 2000,
          max: 30000,
          fallback: 16000
        }) ?? 16000,
      avoid_recent_bank_tests:
        sanitizeInteger(parsedBody.avoid_recent_bank_tests, {
          min: 0,
          max: 30,
          fallback: 8
        }) ?? 8
    };
    const locale = body.locale ?? "es";
    if (locale !== "es")
      return json({ error: "Solo se permite locale=es" }, 400);
    if (!body.opposition_id)
      return json({ error: "opposition_id required" }, 400);
    if (!["facil", "media", "dificil"].includes(body.difficulty))
      return json({ error: "difficulty must be facil|media|dificil" }, 400);

    const requestedCount = clamp(Number(body.count ?? 1), 1, 100);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const structure = await loadStructure(supabase, body.opposition_id);
    const target = resolveTarget(body, structure);

    const { data: previousRows } = await supabase
      .from("question_bank_tests")
      .select("questions")
      .eq("opposition_id", body.opposition_id)
      .eq("topic_id", target.targetId)
      .eq("difficulty", body.difficulty)
      .eq("locale", "es")
      .in("status", ["validated", "published"])
      .order("created_at", { ascending: false })
      .limit(clamp(Number(body.avoid_recent_bank_tests ?? 8), 0, 30));
    const recentQuestions = (
      Array.isArray(previousRows) ? previousRows : []
    ).flatMap((row: any) =>
      Array.isArray(row?.questions)
        ? row.questions
            .map((question: any) => s(question?.question))
            .filter(Boolean)
        : []
    );

    const embedding = await embedQuery(target.queryText);
    const { data: ragRows, error: ragErr } = await supabase.rpc(
      "buscar_articulos",
      {
        query_embedding: embedding,
        match_threshold: body.match_threshold ?? 0.25,
        match_count: body.match_count ?? 80
      }
    );
    if (ragErr)
      throw new Error(`RPC buscar_articulos error: ${ragErr.message}`);

    const chunks = (Array.isArray(ragRows) ? ragRows : [])
      .map((row: any) => {
        const content = s(
          row.content ??
            row.contenido ??
            row.text ??
            row.raw_text ??
            row.snippet
        );
        if (!content) return null;
        return {
          chunkId:
            s(row.chunkId ?? row.chunk_id ?? row.id) || crypto.randomUUID(),
          idBoe: s(row.idBoe ?? row.id_boe ?? row.boe_id) || "unknown",
          article: s(row.article ?? row.articulo ?? row.articulo_num) || null,
          reference:
            s(row.reference ?? row.referencia ?? row.apartado_path) || null,
          unitType: s(row.unit_type ?? row.unitType) || null,
          score:
            typeof row.score === "number"
              ? row.score
              : typeof row.similarity === "number"
                ? row.similarity
                : null,
          title: s(row.title ?? row.titulo ?? row.titulo_ley) || null,
          snippet: s(row.snippet) || null,
          content,
          rawChunk: row
        } as Chunk;
      })
      .filter((row): row is Chunk => Boolean(row))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 40);

    if (!chunks.length) return json({ error: "No RAG chunks returned" }, 500);

    const llmText = await ollamaChat(
      ollamaBaseUrl,
      ollamaModel,
      prompt(body, target, chunks, recentQuestions)
    );
    const parsed = safeJsonParse(llmText);
    const generatedRaw = Array.isArray(parsed?.questions)
      ? parsed.questions
      : [];
    const chunksById = new Map(
      chunks.map((chunk) => [chunk.chunkId, chunk] as const)
    );
    const fallbackChunk = chunks[0];
    const questions = generatedRaw
      .map((question) =>
        normalizeQuestion(question, chunksById, fallbackChunk, target)
      )
      .filter((question): question is Question => Boolean(question))
      .slice(0, 1);
    if (!questions.length)
      return json({ error: "Could not generate any valid questions" }, 500);

    const nowIso = new Date().toISOString();
    const { data: testRow, error: testErr } = await supabase
      .from("question_bank_tests")
      .insert({
        opposition_id: body.opposition_id,
        opposition_name: body.opposition_name ?? body.opposition_id,
        topic_id: target.targetId,
        topic_label: target.targetLabel,
        difficulty: body.difficulty,
        locale: "es",
        question_count: questions.length,
        status: "draft",
        model: `ollama/${ollamaModel}`,
        prompt_version: "bank-generate-v2",
        metadata: {
          target: {
            scope: target.scope,
            targetId: target.targetId,
            targetLabel: target.targetLabel,
            blockId: target.blockId,
            blockLabel: target.blockLabel,
            topicId: target.topicId,
            topicLabel: target.topicLabel
          },
          rag: {
            match_threshold: body.match_threshold ?? 0.25,
            match_count: body.match_count ?? 80
          },
          generator: {
            mode: "single-question",
            requestedCount,
            generatedCount: questions.length
          },
          generated_at: nowIso
        },
        questions
      })
      .select("id")
      .single();
    if (testErr)
      throw new Error(`Insert question_bank_tests error: ${testErr.message}`);
    const bankTestId = (testRow as any)?.id;

    const { error: sourcesErr } = await supabase
      .from("question_bank_sources")
      .insert(
        chunks.map((chunk) => ({
          bank_test_id: bankTestId,
          chunk_id: chunk.chunkId,
          id_boe: chunk.idBoe,
          article: chunk.article,
          reference: chunk.reference,
          unit_type: chunk.unitType,
          score: chunk.score,
          title: chunk.title,
          snippet: chunk.snippet ?? trim(chunk.content, 260),
          raw_chunk: chunk.rawChunk ?? chunk
        }))
      );
    if (sourcesErr)
      throw new Error(
        `Insert question_bank_sources error: ${sourcesErr.message}`
      );

    const { data: insertedQuestionsRaw, error: questionErr } = await supabase
      .from("question_bank_questions")
      .insert(
        questions.map((question, index) => ({
          source_bank_test_id: bankTestId,
          opposition_id: body.opposition_id,
          opposition_name: body.opposition_name ?? body.opposition_id,
          topic_id: target.targetId,
          topic_label: target.targetLabel,
          difficulty: body.difficulty,
          locale: "es",
          status: "draft",
          question: question.question,
          options: question.options,
          correct_option_id: question.correctOptionId,
          explanation: question.explanation,
          citations: question.citations,
          model: `ollama/${ollamaModel}`,
          prompt_version: "bank-generate-v2",
          metadata: {
            generated_at: nowIso,
            source: "bank_generate_draft",
            source_index: index + 1,
            bank_test_id: bankTestId,
            target: {
              scope: target.scope,
              targetId: target.targetId,
              targetLabel: target.targetLabel,
              blockId: target.blockId,
              blockLabel: target.blockLabel,
              topicId: target.topicId,
              topicLabel: target.topicLabel
            }
          }
        }))
      )
      .select("id, citations");
    if (questionErr)
      throw new Error(
        `Insert question_bank_questions error: ${questionErr.message}`
      );

    const questionSources = (
      Array.isArray(insertedQuestionsRaw) ? insertedQuestionsRaw : []
    )
      .flatMap((row: any) => {
        const questionId = Number(row?.id);
        const citations = Array.isArray(row?.citations) ? row.citations : [];
        return citations.map((citation: any) => {
          const chunk = chunksById.get(
            s(citation?.chunkId ?? citation?.chunk_id)
          );
          return {
            question_id: questionId,
            chunk_id: s(citation?.chunkId ?? citation?.chunk_id),
            id_boe:
              s(citation?.idBoe ?? citation?.id_boe ?? chunk?.idBoe) || null,
            article: s(citation?.article ?? chunk?.article) || null,
            reference: s(citation?.reference ?? chunk?.reference) || null,
            unit_type: chunk?.unitType ?? null,
            score: chunk?.score ?? null,
            title: chunk?.title ?? null,
            snippet: chunk?.snippet ?? trim(chunk?.content ?? "", 260),
            raw_chunk: chunk?.rawChunk ?? citation ?? {}
          };
        });
      })
      .filter((row: any) => row.chunk_id);

    if (questionSources.length) {
      const { error: questionSourcesErr } = await supabase
        .from("question_bank_question_sources")
        .insert(questionSources);
      if (questionSourcesErr)
        throw new Error(
          `Insert question_bank_question_sources error: ${questionSourcesErr.message}`
        );
    }

    return json({
      ok: true,
      bank_test_id: bankTestId,
      requested: requestedCount,
      generated: questions.length,
      question_pool_inserted: Array.isArray(insertedQuestionsRaw)
        ? insertedQuestionsRaw.length
        : 0,
      status: "draft",
      target: {
        scope: target.scope,
        id: target.targetId,
        label: target.targetLabel,
        blockId: target.blockId,
        blockLabel: target.blockLabel,
        topicId: target.topicId,
        topicLabel: target.topicLabel
      }
    });
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
