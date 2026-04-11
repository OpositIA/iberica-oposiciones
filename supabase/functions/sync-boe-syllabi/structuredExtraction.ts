/// <reference lib="deno.ns" />
import {
  parseBoeDocument,
  parseBoeSyllabusXml,
  type ParsedBoeDocument,
  type SubtopicRow,
  type TopicRow
} from "./parser.ts";

const OPENROUTER_BASE_URL =
  Deno.env.get("OPENROUTER_BASE_URL")?.trim() || "https://openrouter.ai/api/v1";
const OPENROUTER_APP_URL =
  Deno.env.get("OPENROUTER_APP_URL")?.trim() ||
  "https://ibericaoposiciones.com";
const OPENROUTER_APP_NAME =
  Deno.env.get("OPENROUTER_APP_NAME")?.trim() || "Iberica Oposiciones";
const OPENROUTER_CHAT_MODEL =
  Deno.env.get("OPENROUTER_CHAT_MODEL")?.trim() || "qwen/qwen3.5-flash-02-23";
const OPENROUTER_TIMEOUT_MS = Math.max(
  30_000,
  Number(Deno.env.get("OPENROUTER_TIMEOUT_MS") ?? "90000")
);
const MAX_AI_DOCUMENT_CHARS = 220_000;

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type AiBlock = {
  title: string;
  subtopics: Array<{
    title: string;
    topicNumber: number | null;
  }>;
};

export type TestExamConfig = {
  orderIndex: number;
  exerciseLabel: string;
  systemScope: string | null;
  questionCount: number | null;
  optionsCount: number | null;
  correctAnswerValue: number | null;
  wrongAnswerPenalty: number | null;
  blankAnswerPenalty: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  passingScore: number | null;
  durationMinutes: number | null;
  notes: string | null;
  sourceExcerpt: string | null;
  isPrimary: boolean;
};

type AiExtractionResult = {
  matchesWatchlist: boolean | null;
  hasSyllabus: boolean | null;
  reason: string | null;
  blocks: AiBlock[];
  testExams: TestExamConfig[];
};

export type StructuredSyllabusExtraction = Awaited<
  ReturnType<typeof parseBoeSyllabusXml>
> & {
  documentTitle: string | null;
  topics: TopicRow[];
  subtopics: SubtopicRow[];
  testExamConfigs: TestExamConfig[];
  primaryTestExamConfig: TestExamConfig | null;
  extractionProvider: "openrouter" | "heuristic";
  extractionModel: string | null;
  extractionNotes: Record<string, unknown>;
};

type ExtractStructuredSyllabusParams = {
  supabase: SupabaseRpcClient;
  xmlText: string;
  boeId: string;
  oppositionId: string;
  watchlistLabel: string;
  candidateTitle: string;
};

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string, maxLen = 120): string {
  const slug = stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "item";
  return slug.slice(0, maxLen).replace(/-+$/g, "") || "item";
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  const resolved = `${base}-${index}`;
  used.add(resolved);
  return resolved;
}

function safeString(value: unknown, maxLen = 2_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function safePositiveInt(value: unknown): number | null {
  const numeric = safeNumber(value);
  if (numeric === null) return null;
  const integer = Math.floor(numeric);
  return integer > 0 ? integer : null;
}

async function getRuntimeSecret(
  supabase: SupabaseRpcClient,
  name: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_runtime_secret", {
    p_name: name
  });
  if (error)
    throw new Error(`get_runtime_secret(${name}) failed: ${error.message}`);
  return safeString(data, 2_000);
}

async function resolveOpenRouterApiKey(
  _supabase: SupabaseRpcClient
): Promise<string | null> {
  return safeString(Deno.env.get("OPENROUTER_API_KEY"), 2_000);
}

async function callOpenRouterJson(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": OPENROUTER_APP_URL,
      "X-Title": OPENROUTER_APP_NAME
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`OpenRouter error (${response.status}): ${detail}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("OpenRouter returned an invalid JSON payload.");

  return data as Record<string, unknown>;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty LLM response");

  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (codeBlockMatch) {
    const parsed = tryParseJson(codeBlockMatch[1]);
    if (parsed) return parsed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParseJson(trimmed.slice(start, end + 1));
    if (parsed) return parsed;
  }

  throw new Error("Could not parse JSON object from LLM response");
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // noop
  }
  return null;
}

function serializeLines(
  lines: Array<{ text: string; className: string | null }>
): string {
  return lines
    .map((line, index) => {
      const className = safeString(line.className, 80) || "sin_clase";
      return `[${index + 1}] (${className}) ${normalizeWhitespace(line.text)}`;
    })
    .join("\n");
}

function extractAiText(data: Record<string, unknown>): string {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .join("\n");
  }
  return "";
}

function normalizeAiBlocks(value: unknown): AiBlock[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): AiBlock | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = safeString(record.title, 300);
      if (!title) return null;

      const seenTitles = new Set<string>();
      const subtopics = Array.isArray(record.subtopics)
        ? record.subtopics
            .map((subtopic): AiBlock["subtopics"][number] | null => {
              if (!subtopic || typeof subtopic !== "object") return null;
              const subtopicRecord = subtopic as Record<string, unknown>;
              const subtopicTitle = safeString(subtopicRecord.title, 500);
              if (!subtopicTitle) return null;
              const normalizedKey = stripAccents(subtopicTitle).toLowerCase();
              if (seenTitles.has(normalizedKey)) return null;
              seenTitles.add(normalizedKey);
              return {
                title: subtopicTitle,
                topicNumber: safePositiveInt(subtopicRecord.topicNumber)
              };
            })
            .filter((subtopic): subtopic is AiBlock["subtopics"][number] =>
              Boolean(subtopic)
            )
        : [];

      return {
        title,
        subtopics
      };
    })
    .filter((block): block is AiBlock => Boolean(block));
}

function normalizeAiTestExamConfigs(value: unknown): TestExamConfig[] {
  if (!Array.isArray(value)) return [];

  const configs = value
    .map((item, index): TestExamConfig | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const exerciseLabel = safeString(record.exerciseLabel, 240);
      if (!exerciseLabel) return null;

      return {
        orderIndex: index + 1,
        exerciseLabel,
        systemScope: safeString(record.systemScope, 160),
        questionCount: safePositiveInt(record.questionCount),
        optionsCount: safePositiveInt(record.optionsCount),
        correctAnswerValue: safeNumber(record.correctAnswerValue),
        wrongAnswerPenalty: safeNumber(record.wrongAnswerPenalty),
        blankAnswerPenalty: safeNumber(record.blankAnswerPenalty),
        scoreMin: safeNumber(record.scoreMin),
        scoreMax: safeNumber(record.scoreMax),
        passingScore: safeNumber(record.passingScore),
        durationMinutes: safePositiveInt(record.durationMinutes),
        notes: safeString(record.notes, 1_500),
        sourceExcerpt: safeString(record.sourceExcerpt, 2_000),
        isPrimary: false
      };
    })
    .filter((config): config is TestExamConfig => Boolean(config))
    .filter((config) => {
      const scope = stripAccents(config.systemScope ?? "").toLowerCase();
      const label = stripAccents(config.exerciseLabel).toLowerCase();
      return (
        !scope.includes("promocion interna") &&
        !label.includes("promocion interna")
      );
    });

  return configs.map((config, index) => ({
    ...config,
    orderIndex: index + 1
  }));
}

function pickPrimaryTestExamConfig(
  configs: TestExamConfig[]
): TestExamConfig | null {
  if (configs.length === 0) return null;

  const preferred =
    configs.find((config) =>
      stripAccents(config.systemScope ?? "")
        .toLowerCase()
        .includes("acceso libre")
    ) ||
    configs.find((config) =>
      stripAccents(config.exerciseLabel)
        .toLowerCase()
        .includes("primer ejercicio")
    ) ||
    configs[0];

  return preferred ? { ...preferred, isPrimary: true } : null;
}

function finalizeTestExamConfigs(configs: TestExamConfig[]): TestExamConfig[] {
  const primary = pickPrimaryTestExamConfig(configs);
  return configs.map((config) => ({
    ...config,
    isPrimary:
      primary !== null &&
      config.orderIndex === primary.orderIndex &&
      config.exerciseLabel === primary.exerciseLabel
  }));
}

async function extractWithAi(params: {
  supabase: SupabaseRpcClient;
  boeId: string;
  oppositionId: string;
  watchlistLabel: string;
  candidateTitle: string;
  document: ParsedBoeDocument;
  annexText: string;
  annexLines: Array<{ text: string; className: string | null }>;
}): Promise<AiExtractionResult | null> {
  const apiKey = await resolveOpenRouterApiKey(params.supabase);
  if (!apiKey) return null;

  const truncatedDocument =
    params.document.fullText.length > MAX_AI_DOCUMENT_CHARS
      ? `${params.document.fullText.slice(0, MAX_AI_DOCUMENT_CHARS)}\n[TRUNCATED]`
      : params.document.fullText;

  const prompt = `
Extrae estructura de temario y reglas de examen tipo test de una convocatoria oficial del BOE.

Contexto:
- boeId: ${params.boeId}
- oppositionId interno: ${params.oppositionId}
- label watchlist: ${params.watchlistLabel}
- titulo candidato: ${params.candidateTitle}
- titulo documento: ${params.document.documentTitle ?? ""}
- fecha publicacion: ${params.document.publishedAt ?? ""}
- seccion: ${params.document.sectionCode ?? ""}
- subseccion: ${params.document.subsectionCode ?? ""}

Reglas:
1. Decide si el documento corresponde realmente a la oposicion de la watchlist.
2. Extrae SOLO el temario oficial del programa/anexo. Ignora secciones de plazas, tasas, requisitos, firmas, anexos administrativos o instrucciones.
3. Los bloques suelen venir como encabezados del anexo. Devuelve cada bloque con sus temas en orden.
4. Para los examenes, devuelve SOLO ejercicios de tipo test o cuestionario de respuestas alternativas del sistema de ACCESO LIBRE. Ignora completamente los ejercicios de promocion interna. Si el ejercicio es mixto (por ejemplo, practicos con preguntas abiertas y algunas alternativas), NO lo incluyas.
5. Si una penalizacion dice "un cuarto del valor de una respuesta correcta", devuelve wrongAnswerPenalty = 0.25 asumiendo correctAnswerValue = 1.
6. Si las respuestas en blanco no penalizan, devuelve blankAnswerPenalty = 0.
7. Mantente literal con los titulos de bloques y temas.
8. Devuelve JSON estricto, sin markdown.

Formato JSON:
{
  "matchesWatchlist": true,
  "hasSyllabus": true,
  "reason": "motivo breve",
  "blocks": [
    {
      "title": "Bloque oficial",
      "subtopics": [
        { "title": "Tema 1. ...", "topicNumber": 1 }
      ]
    }
  ],
  "testExams": [
    {
      "exerciseLabel": "Acceso libre - Primer ejercicio",
      "systemScope": "acceso libre",
      "questionCount": 80,
      "optionsCount": 4,
      "correctAnswerValue": 1,
      "wrongAnswerPenalty": 0.25,
      "blankAnswerPenalty": 0,
      "scoreMin": 0,
      "scoreMax": 10,
      "passingScore": 5,
      "durationMinutes": 90,
      "notes": "cuestionario sobre el programa del anexo I",
      "sourceExcerpt": "fragmento corto del BOE"
    }
  ]
}

ANEXO I / TEMARIO ESTRUCTURADO:
${params.annexText}

DOCUMENTO COMPLETO:
${truncatedDocument}

ANEXO I / TEMARIO CON CLASES XML:
${serializeLines(params.annexLines)}
`.trim();

  const response = await callOpenRouterJson(apiKey, {
    model: OPENROUTER_CHAT_MODEL,
    temperature: 0,
    top_p: 1,
    messages: [
      {
        role: "system",
        content:
          "Eres un extractor juridico de convocatorias del BOE. Respondes solo JSON valido."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const parsed = extractJsonObject(extractAiText(response));
  return {
    matchesWatchlist:
      typeof parsed.matchesWatchlist === "boolean"
        ? parsed.matchesWatchlist
        : null,
    hasSyllabus:
      typeof parsed.hasSyllabus === "boolean" ? parsed.hasSyllabus : null,
    reason: safeString(parsed.reason, 1_500),
    blocks: normalizeAiBlocks(parsed.blocks),
    testExams: finalizeTestExamConfigs(
      normalizeAiTestExamConfigs(parsed.testExams)
    )
  };
}

function buildRowsFromAiBlocks(blocks: AiBlock[]): {
  topics: TopicRow[];
  subtopics: SubtopicRow[];
} {
  const topicRows: TopicRow[] = [];
  const subtopicRows: SubtopicRow[] = [];
  const usedTopicCodes = new Set<string>();
  const usedSubtopicCodes = new Set<string>();

  blocks.forEach((block, blockIndex) => {
    const topicCode = uniqueSlug(
      slugify(block.title, 80) || `bloque-${blockIndex + 1}`,
      usedTopicCodes
    );
    topicRows.push({
      topic_title: block.title,
      topic_code: topicCode,
      order_index: blockIndex + 1
    });

    block.subtopics.forEach((subtopic, subtopicIndex) => {
      const topicNumber = subtopic.topicNumber ?? subtopicIndex + 1;
      const title = subtopic.title;
      const subtopicCode = uniqueSlug(
        slugify(`tema-${topicNumber}-${title}`, 140),
        usedSubtopicCodes
      );
      subtopicRows.push({
        parent_topic_code: topicCode,
        subtopic_code: subtopicCode,
        topic_number: topicNumber,
        subtopic_title: title,
        section_title: null,
        order_index: subtopicIndex + 1
      });
    });
  });

  return {
    topics: topicRows,
    subtopics: subtopicRows
  };
}

function parseDurationMinutes(value: string): number | null {
  const normalized = stripAccents(value).toLowerCase();

  // Check "N horas y media" before the general hours regex
  const hoursAndHalf = normalized.match(/(\d+)\s+horas?\s+y\s+media/);
  if (hoursAndHalf) return Number(hoursAndHalf[1]) * 60 + 30;

  if (normalized.includes("hora y media")) return 90;
  if (normalized.includes("media hora")) return 30;

  const hoursAndMinutes = normalized.match(
    /(\d+)\s+horas?(?:\s+y\s+(\d+)\s+minutos?)?/
  );
  if (hoursAndMinutes) {
    const hours = Number(hoursAndMinutes[1] ?? "0");
    const minutes = Number(hoursAndMinutes[2] ?? "0");
    return hours * 60 + minutes;
  }

  const minutesOnly = normalized.match(/(\d+)\s+minutos?/);
  if (minutesOnly) return Number(minutesOnly[1]);

  if (normalized.includes("dos horas y treinta")) return 150;
  if (normalized.includes("una hora")) return 60;
  if (normalized.includes("dos horas")) return 120;

  return null;
}

function numberFromSpanishWord(value: string): number | null {
  const normalized = stripAccents(value).toLowerCase();
  const map: Record<string, number> = {
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    veinte: 20,
    cincuenta: 50,
    ochenta: 80,
    cien: 100
  };
  return map[normalized] ?? null;
}

function extractPenaltyValue(text: string): number | null {
  const normalized = stripAccents(text).toLowerCase();

  const decimal = normalized.match(
    /penaliz[a-z]*[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*(?:puntos?|del valor)?/
  );
  if (decimal) return safeNumber(decimal[1]);

  if (normalized.includes("un cuarto")) return 0.25;
  if (normalized.includes("1/4")) return 0.25;
  if (normalized.includes("un tercio")) return 1 / 3;
  if (normalized.includes("1/3")) return 1 / 3;
  if (normalized.includes("medio punto")) return 0.5;
  if (normalized.includes("mitad del valor")) return 0.5;

  return null;
}

function extractHeuristicTestExamConfigs(
  document: ParsedBoeDocument
): TestExamConfig[] {
  const lines = document.lines.map((line) => normalizeWhitespace(line.text));
  const configs: TestExamConfig[] = [];

  let currentScope: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (/Proceso selectivo de acceso libre/i.test(line))
      currentScope = "acceso libre";
    else if (/Proceso selectivo de promoci[oó]n interna/i.test(line))
      currentScope = "promocion interna";

    if (!/^(Primer|Segundo|Tercer)\s+ejercicio:?/i.test(line)) continue;

    const nextChunk = lines.slice(index, index + 10).join(" ");
    const normalizedChunk = stripAccents(nextChunk).toLowerCase();

    if (!normalizedChunk.includes("cuestionario")) continue;
    if (!normalizedChunk.includes("respuesta")) continue;
    if (!normalizedChunk.includes("alternativa")) continue;
    if (
      normalizedChunk.includes("respuesta breve") ||
      normalizedChunk.includes("razonada") ||
      normalizedChunk.includes("supuestos practicos")
    )
      continue;

    const questionCountMatch =
      nextChunk.match(/cuestionario(?:[^0-9]{0,40})(\d{1,3})\s+preguntas/i) ||
      nextChunk.match(
        /(\d{1,3})\s+preguntas\s+con\s+respuestas?\s+alternativas/i
      );

    const optionsMatch =
      nextChunk.match(/(\d{1,2})\s+respuestas?\s+alternativas/i) ||
      nextChunk.match(
        /\b(una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+respuestas?\s+alternativas/i
      );

    const scoreRangeMatch = nextChunk.match(
      /(?:de|entre)\s+(\d+(?:[.,]\d+)?)\s+a\s+(\d+(?:[.,]\d+)?)\s+puntos?/i
    );
    const passingScoreMatch = nextChunk.match(
      /m[ií]nimo\s+de\s+(\d+(?:[.,]\d+)?)\s+puntos?/i
    );
    const durationMatch = nextChunk.match(/tiempo m[aá]ximo[^.]{0,80}\./i);

    const optionsCount =
      safePositiveInt(optionsMatch?.[1]) ??
      (optionsMatch?.[1] ? numberFromSpanishWord(optionsMatch[1]) : null);

    configs.push({
      orderIndex: configs.length + 1,
      exerciseLabel: `${currentScope ? `${currentScope} - ` : ""}${line.replace(/:$/, "")}`,
      systemScope: currentScope,
      questionCount: safePositiveInt(questionCountMatch?.[1]),
      optionsCount,
      correctAnswerValue: 1,
      wrongAnswerPenalty: extractPenaltyValue(nextChunk),
      blankAnswerPenalty: /blanco no penalizan?/i.test(nextChunk) ? 0 : null,
      scoreMin: safeNumber(scoreRangeMatch?.[1]),
      scoreMax: safeNumber(scoreRangeMatch?.[2]),
      passingScore: safeNumber(passingScoreMatch?.[1]),
      durationMinutes: durationMatch
        ? parseDurationMinutes(durationMatch[0])
        : null,
      notes: safeString(nextChunk, 1_500),
      sourceExcerpt: safeString(nextChunk, 2_000),
      isPrimary: false
    });
  }

  return finalizeTestExamConfigs(configs);
}

export async function extractStructuredSyllabusFromXml({
  supabase,
  xmlText,
  boeId,
  oppositionId,
  watchlistLabel,
  candidateTitle
}: ExtractStructuredSyllabusParams): Promise<StructuredSyllabusExtraction> {
  const parsed = await parseBoeSyllabusXml(xmlText);
  const document = parseBoeDocument(xmlText);

  let extractionProvider: StructuredSyllabusExtraction["extractionProvider"] =
    "heuristic";
  let extractionModel: string | null = null;
  let extractionNotes: Record<string, unknown> = {};
  let topics = parsed.topics;
  let subtopics = parsed.subtopics;

  const heuristicTestExams = extractHeuristicTestExamConfigs(document);
  let testExamConfigs = heuristicTestExams;

  try {
    const aiResult = await extractWithAi({
      supabase,
      boeId,
      oppositionId,
      watchlistLabel,
      candidateTitle,
      document,
      annexText: parsed.rawText,
      annexLines: document.lines.slice(parsed.startLineIdx, parsed.endLineIdx)
    });

    if (aiResult) {
      extractionProvider = "openrouter";
      extractionModel = OPENROUTER_CHAT_MODEL;
      extractionNotes = {
        ai_matches_watchlist: aiResult.matchesWatchlist,
        ai_has_syllabus: aiResult.hasSyllabus,
        ai_reason: aiResult.reason
      };

      if (
        aiResult.blocks.length > 0 &&
        aiResult.blocks.some((block) => block.subtopics.length > 0)
      ) {
        const aiRows = buildRowsFromAiBlocks(aiResult.blocks);
        topics = aiRows.topics;
        subtopics = aiRows.subtopics;
      }

      if (aiResult.testExams.length > 0) {
        testExamConfigs = aiResult.testExams;
      }
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        msg: "boe_ai_extraction_failed",
        boe_id: boeId,
        opposition_id: oppositionId,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    extractionNotes = {
      ...extractionNotes,
      ai_error: error instanceof Error ? error.message : String(error)
    };
  }

  const primaryTestExamConfig =
    testExamConfigs.find((config) => config.isPrimary) ?? null;

  return {
    ...parsed,
    documentTitle: parsed.documentTitle ?? document.documentTitle,
    topics,
    subtopics,
    testExamConfigs,
    primaryTestExamConfig,
    extractionProvider,
    extractionModel,
    extractionNotes
  };
}
