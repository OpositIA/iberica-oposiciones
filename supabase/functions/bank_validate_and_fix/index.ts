/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeCode,
  sanitizeInteger,
} from "../_shared/inputSanitization.ts";

type Difficulty = "facil" | "media" | "dificil";
type QuestionOptionId = "A" | "B" | "C" | "D";

type ValidateRequest = {
  bank_test_id: string;
  publish?: boolean;
  max_questions?: number;
};

type BatchSourceRow = {
  id: number;
  chunk_id: string;
  id_boe: string | null;
  article: string | null;
  reference: string | null;
  unit_type: string | null;
  score: number | null;
  title: string | null;
  snippet: string | null;
  raw_chunk: unknown;
};

type BankTestRow = {
  id: string;
  opposition_id: string;
  opposition_name: string;
  topic_id: string;
  topic_label: string;
  difficulty: Difficulty;
  locale: "es";
  status: "draft" | "validated" | "published" | "disabled";
  questions: unknown;
  metadata: Record<string, unknown> | null;
};

type QuestionBankRow = {
  id: number;
  citations: unknown;
  metadata: Record<string, unknown> | null;
};

type NormalizedOption = { id: QuestionOptionId; text: string };
type Citation = {
  chunkId: string;
  idBoe: string;
  article: string;
  reference: string;
};
type NormalizedQuestion = {
  topicId: string;
  topicLabel: string;
  question: string;
  options: NormalizedOption[];
  correctOptionId: QuestionOptionId;
  explanation: string;
  citations: Citation[];
};
type ValidationResult = {
  verdict: "ok" | "fixed" | "rejected";
  changed: boolean;
  issues: string[];
  question: string;
  options: NormalizedOption[];
  correctOptionId: QuestionOptionId;
  explanation: string;
  citations: Citation[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function requireEdgeSecretIfConfigured(req: Request): Response | null {
  const edgeSecret = Deno.env.get("EDGE_SECRET");
  if (!edgeSecret) return null;
  const got = req.headers.get("x-edge-secret");
  if (!got || got !== edgeSecret) return json({ error: "Unauthorized (x-edge-secret)" }, 401);
  return null;
}

function sanitizeLLMText(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function safeJsonParse(text: string): any {
  const cleaned = sanitizeLLMText(text)
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  return JSON.parse(cleaned);
}

async function ollamaChat(baseUrl: string, model: string, prompt: string): Promise<string> {
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
            "Eres un validador de preguntas de oposiciones. Verificas legalidad y devuelves SOLO JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.1, top_p: 0.9, repeat_penalty: 1.1 },
    }),
  });

  if (!response.ok) 
    throw new Error(`Ollama chat error (${response.status}): ${await response.text()}`);
  
  const data = await response.json();
  const content = data?.message?.content;
  if (typeof content !== "string") throw new Error("No message.content in Ollama response");
  return content;
}

function normalizeOptionText(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const record = input as Record<string, unknown>;
  return String(
    record.text ?? record.label ?? record.content ?? record.option ?? record.answer ?? "",
  ).trim();
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractOptionIdFromString(raw: string): QuestionOptionId | null {
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (!folded) return null;

  const ids: QuestionOptionId[] = ["A", "B", "C", "D"];
  if (ids.includes(folded as QuestionOptionId)) return folded as QuestionOptionId;

  const keywordMatch = folded.match(
    /(?:OPCION|RESPUESTA|CORRECTA|ALTERNATIVA)\s*[:-]?\s*([ABCD])(?:\b|[).])/,
  );
  if (keywordMatch?.[1] && ids.includes(keywordMatch[1] as QuestionOptionId))
    return keywordMatch[1] as QuestionOptionId;

  const compactMatch = folded.match(/(?:^|[^A-Z])([ABCD])\s*[).:-]?\s*$/);
  if (compactMatch?.[1] && ids.includes(compactMatch[1] as QuestionOptionId))
    return compactMatch[1] as QuestionOptionId;

  const isolatedMatch = folded.match(/\b([ABCD])\b/);
  if (isolatedMatch?.[1] && ids.includes(isolatedMatch[1] as QuestionOptionId))
    return isolatedMatch[1] as QuestionOptionId;

  return null;
}

function inferCorrectOptionFromExplanation(
  explanation: string,
  options: NormalizedOption[],
): QuestionOptionId | null {
  const normalizedExplanation = normalizeForMatch(explanation);
  if (!normalizedExplanation) return null;

  const explanationTokens = new Set(
    normalizedExplanation
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
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

      const shared = optionTokens.filter((token) => explanationTokens.has(token))
        .length;
      return { id: option.id, score: shared / optionTokens.length };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.7) return null;
  if (second && best.score - second.score < 0.15) return null;
  return best.id;
}

function standardizeOptions(input: unknown): NormalizedOption[] | null {
  const ids: QuestionOptionId[] = ["A", "B", "C", "D"];
  let options = input;
  if (!options) return null;

  if (!Array.isArray(options) && typeof options === "object") {
    const record = options as Record<string, unknown>;
    if (ids.every((id) => Object.prototype.hasOwnProperty.call(record, id))) {
      const built = ids.map((id) => ({
        id,
        text: normalizeOptionText(record[id]) || String(record[id] ?? "").trim(),
      }));
      return built.every((option) => option.text) ? built : null;
    }
    options = Object.values(record);
  }

  if (!Array.isArray(options) || options.length < 4) return null;
  const sliced = options.slice(0, 4);
  const texts = sliced.map((option) => normalizeOptionText(option) || String(option ?? "").trim());
  if (texts.some((text) => !text)) return null;

  return ids.map((id, index) => ({ id, text: texts[index] }));
}

function normalizeCorrectOptionId(raw: unknown, options: NormalizedOption[]): QuestionOptionId {
  const ids: QuestionOptionId[] = ["A", "B", "C", "D"];
  if (typeof raw === "string") {
    const parsedId = extractOptionIdFromString(raw);
    if (parsedId) return parsedId;

    const value = raw.trim();
    const idx = options.findIndex(
      (option) => normalizeForMatch(option.text) === normalizeForMatch(value),
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

function normalizeCitation(raw: unknown, sourceByChunkId: Map<string, BatchSourceRow>): Citation | null {
  const chunkId = String(
    (raw as Record<string, unknown> | null)?.chunkId ??
      (raw as Record<string, unknown> | null)?.chunk_id ??
      raw ??
      "",
  ).trim();
  if (!chunkId) return null;
  const source = sourceByChunkId.get(chunkId);
  if (!source) return null;
  return {
    chunkId,
    idBoe: String(
      (raw as Record<string, unknown> | null)?.idBoe ??
        (raw as Record<string, unknown> | null)?.id_boe ??
        source.id_boe ??
        "",
    ).trim(),
    article: String(
      (raw as Record<string, unknown> | null)?.article ?? source.article ?? "",
    ).trim(),
    reference: String(
      (raw as Record<string, unknown> | null)?.reference ?? source.reference ?? "",
    ).trim(),
  };
}

function normalizeQuestion(
  raw: unknown,
  fallbackTopicId: string,
  fallbackTopicLabel: string,
  sourceByChunkId: Map<string, BatchSourceRow>,
): NormalizedQuestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const question = raw as Record<string, unknown>;
  const statement = String(
    question.question ?? question.enunciado ?? question.statement ?? question.prompt ?? question.text ?? "",
  ).trim();
  if (statement.length < 12) return null;

  const options = standardizeOptions(
    question.options ?? question.choices ?? question.answers ?? question.alternatives,
  );
  if (!options) return null;

  const citationsRaw = Array.isArray(question.citations)
    ? question.citations
    : Array.isArray(question.references)
    ? question.references
    : Array.isArray(question.sources)
    ? question.sources
    : [];

  const citations = citationsRaw
    .map((citation) => normalizeCitation(citation, sourceByChunkId))
    .filter((citation): citation is Citation => Boolean(citation));

  const firstSource = sourceByChunkId.values().next().value as BatchSourceRow | undefined;
  if (!citations.length && firstSource) {
    citations.push({
      chunkId: firstSource.chunk_id,
      idBoe: String(firstSource.id_boe ?? "").trim(),
      article: String(firstSource.article ?? "").trim(),
      reference: String(firstSource.reference ?? "").trim(),
    });
  }

  const explanation =
    String(question.explanation ?? question.explicacion ?? question.justification ?? "")
      .trim() || "Respuesta basada en el texto legal citado.";

  const parsedCorrectOptionId = normalizeCorrectOptionId(
    question.correctOptionId ??
      question.correct_option_id ??
      question.correct ??
      question.correctAnswer ??
      question.correct_answer,
    options,
  );
  const inferredCorrectOptionId = inferCorrectOptionFromExplanation(
    explanation,
    options,
  );

  return {
    topicId: String(question.topicId ?? question.topic_id ?? fallbackTopicId).trim() || fallbackTopicId,
    topicLabel:
      String(question.topicLabel ?? question.topic_label ?? fallbackTopicLabel).trim() || fallbackTopicLabel,
    question: statement,
    options,
    correctOptionId: inferredCorrectOptionId ?? parsedCorrectOptionId,
    explanation,
    citations,
  };
}

function buildSourcesBlock(sources: BatchSourceRow[]): string {
  return sources
    .map((source) => {
      const excerpt =
        String((source.raw_chunk as Record<string, unknown> | null)?.content ?? "").trim() ||
        String(source.snippet ?? "").trim();
      return [
        `### SOURCE chunkId=${source.chunk_id} | idBoe=${source.id_boe ?? ""} | article=${source.article ?? ""} | reference=${source.reference ?? ""}`,
        source.title ? `TITLE: ${source.title}` : "",
        `EXCERPT: ${excerpt.slice(0, 1400)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildValidationPrompt(
  bank: BankTestRow,
  question: NormalizedQuestion,
  sources: BatchSourceRow[],
): string {
  const sourcesBlock = buildSourcesBlock(sources);
  return `
Valida y corrige una pregunta de oposicion usando SOLO las fuentes dadas.

OBJETIVO:
- opposition: ${bank.opposition_name}
- topicId: ${question.topicId}
- topicLabel: ${question.topicLabel}
- difficulty: ${bank.difficulty}

PREGUNTA ACTUAL:
{
  "question": ${JSON.stringify(question.question)},
  "options": ${JSON.stringify(question.options)},
  "correctOptionId": ${JSON.stringify(question.correctOptionId)},
  "explanation": ${JSON.stringify(question.explanation)},
  "citations": ${JSON.stringify(question.citations)}
}

REGLAS:
- Verifica si el enunciado es correcto juridicamente.
- Verifica si la respuesta correcta coincide con las fuentes.
- Verifica si la explicacion justifica bien la respuesta correcta.
- Si algo falla, corrige enunciado, opciones, respuesta correcta y explicacion.
- Mantén exactamente 4 opciones A/B/C/D.
- No inventes citas fuera de los chunkId disponibles.
- Si la pregunta no se puede salvar con estas fuentes, marca verdict="rejected".

FUENTES:
${sourcesBlock}

Devuelve JSON estricto:
{
  "verdict": "ok|fixed|rejected",
  "changed": true,
  "issues": ["..."],
  "question": "...",
  "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
  "correctOptionId": "A|B|C|D",
  "explanation": "...",
  "citations": [{"chunkId":"...","idBoe":"...","article":"...","reference":"..."}]
}
`.trim();
}

function mergeValidationResult(
  original: NormalizedQuestion,
  parsed: any,
  sourceByChunkId: Map<string, BatchSourceRow>,
): ValidationResult {
  const options = standardizeOptions(parsed?.options) ?? original.options;
  const citationsRaw = Array.isArray(parsed?.citations) ? parsed.citations : original.citations;
  const citations = citationsRaw
    .map((citation: unknown) => normalizeCitation(citation, sourceByChunkId))
    .filter((citation: Citation | null): citation is Citation => Boolean(citation));

  const explanation =
    String(parsed?.explanation ?? original.explanation).trim() || original.explanation;
  const parsedCorrectOptionId = normalizeCorrectOptionId(
    parsed?.correctOptionId,
    options,
  );
  const inferredCorrectOptionId = inferCorrectOptionFromExplanation(
    explanation,
    options,
  );

  return {
    verdict:
      parsed?.verdict === "ok" || parsed?.verdict === "fixed" || parsed?.verdict === "rejected"
        ? parsed.verdict
        : "fixed",
    changed: Boolean(parsed?.changed),
    issues: Array.isArray(parsed?.issues) ? parsed.issues.map((issue) => String(issue)) : [],
    question: String(parsed?.question ?? original.question).trim() || original.question,
    options,
    correctOptionId: inferredCorrectOptionId ?? parsedCorrectOptionId,
    explanation,
    citations: citations.length ? citations : original.citations,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const secretError = requireEdgeSecretIfConfigured(req);
  if (secretError) return secretError;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ollamaBaseUrl = Deno.env.get("OLLAMA_BASE_URL");
    const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "deepseek-r1:14b";
    if (!supabaseUrl || !serviceRoleKey) 
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    
    if (!ollamaBaseUrl) return json({ error: "Missing OLLAMA_BASE_URL" }, 500);

    let parsedBody: ValidateRequest;
    try {
      parsedBody = await parseJsonBody<ValidateRequest>(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid JSON body") 
        return json({ error: error.message }, 400);
      
      throw error;
    }

    const body: ValidateRequest = {
      bank_test_id: sanitizeCode(parsedBody.bank_test_id, 80),
      publish: sanitizeBoolean(parsedBody.publish),
      max_questions:
        sanitizeInteger(parsedBody.max_questions, {
          min: 1,
          max: 100,
          fallback: 100,
        }) ?? 100,
    };
    const bankTestId = body.bank_test_id;
    if (!bankTestId) return json({ error: "bank_test_id required" }, 400);

    const maxQuestions = clamp(Number(body.max_questions ?? 100), 1, 100);
    const publish = body.publish === true;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: bankRow, error: bankErr } = await supabase
      .from("question_bank_tests")
      .select("id, opposition_id, opposition_name, topic_id, topic_label, difficulty, locale, status, questions, metadata")
      .eq("id", bankTestId)
      .single();
    if (bankErr || !bankRow) 
      return json({ error: `question_bank_tests not found: ${bankErr?.message ?? bankTestId}` }, 404);
    

    const { data: sourceRowsRaw, error: sourceErr } = await supabase
      .from("question_bank_sources")
      .select("id, chunk_id, id_boe, article, reference, unit_type, score, title, snippet, raw_chunk")
      .eq("bank_test_id", bankTestId)
      .order("score", { ascending: false });
    if (sourceErr) throw new Error(`Load question_bank_sources error: ${sourceErr.message}`);

    const sourceRows = (Array.isArray(sourceRowsRaw) ? sourceRowsRaw : []) as BatchSourceRow[];
    if (!sourceRows.length) 
      return json({ error: "No question_bank_sources found for this bank_test_id" }, 409);
    
    const sourceByChunkId = new Map(sourceRows.map((row) => [row.chunk_id, row] as const));

    const originalQuestions = Array.isArray(bankRow.questions) ? [...bankRow.questions] : [];
    const inputQuestions = originalQuestions.slice(0, maxQuestions);
    if (!inputQuestions.length) return json({ error: "No questions found in question_bank_tests.questions" }, 409);

    const questionEntries = inputQuestions.map((question, batchIndex) => ({
      batchIndex,
      normalized: normalizeQuestion(
        question,
        String(bankRow.topic_id),
        String(bankRow.topic_label),
        sourceByChunkId,
      ),
    }));
    const normalizedEntries = questionEntries.filter(
      (entry): entry is { batchIndex: number; normalized: NormalizedQuestion } => Boolean(entry.normalized),
    );
    if (!normalizedEntries.length) return json({ error: "No valid questions to validate" }, 409);

    const correctedByBatchIndex = new Map<number, NormalizedQuestion>();
    const validationDetails: Array<Record<string, unknown>> = [];

    for (const { batchIndex, normalized: question } of normalizedEntries) {
      const citedSources = question.citations
        .map((citation) => sourceByChunkId.get(citation.chunkId))
        .filter((source): source is BatchSourceRow => Boolean(source));
      const candidateSources = citedSources.length ? citedSources : sourceRows.slice(0, 8);

      const prompt = buildValidationPrompt(bankRow as BankTestRow, question, candidateSources);
      const llmText = await ollamaChat(ollamaBaseUrl, ollamaModel, prompt);
      const parsed = safeJsonParse(llmText);
      const result = mergeValidationResult(question, parsed, sourceByChunkId);

      if (result.verdict === "rejected") {
        validationDetails.push({
          batch_index: batchIndex,
          verdict: result.verdict,
          issues: result.issues,
          kept_original: true,
        });
        correctedByBatchIndex.set(batchIndex, question);
        continue;
      }

      correctedByBatchIndex.set(batchIndex, {
        topicId: question.topicId,
        topicLabel: question.topicLabel,
        question: result.question,
        options: result.options,
        correctOptionId: result.correctOptionId,
        explanation: result.explanation,
        citations: result.citations,
      });
      validationDetails.push({
        batch_index: batchIndex,
        verdict: result.verdict,
        changed: result.changed,
        issues: result.issues,
      });
    }

    for (const entry of questionEntries) {
      if (entry.normalized) continue;
      validationDetails.push({
        batch_index: entry.batchIndex,
        verdict: "skipped",
        changed: false,
        issues: ["Pregunta invalida en origen; se conserva sin cambios."],
      });
    }

    const finalBatchQuestions = [...originalQuestions];
    for (const { batchIndex, normalized } of normalizedEntries) 
      finalBatchQuestions[batchIndex] = correctedByBatchIndex.get(batchIndex) ?? normalized;
    

    const nextStatus = publish ? "published" : "validated";
    const validatedAt = new Date().toISOString();
    const nextMetadata = {
      ...((bankRow.metadata as Record<string, unknown> | null) ?? {}),
      validation: {
        source: "bank_validate_and_fix",
        validated_at: validatedAt,
        publish_requested: publish,
        results: validationDetails,
      },
    };

    const { error: updateBatchErr } = await supabase
      .from("question_bank_tests")
      .update({
        questions: finalBatchQuestions,
        status: nextStatus,
        validated_at: validatedAt,
        prompt_version: "bank-validate-v1",
        metadata: nextMetadata,
      })
      .eq("id", bankTestId);
    if (updateBatchErr) throw new Error(`Update question_bank_tests error: ${updateBatchErr.message}`);

    const { data: questionRowsRaw, error: questionRowsErr } = await supabase
      .from("question_bank_questions")
      .select("id, citations, metadata")
      .eq("source_bank_test_id", bankTestId)
      .order("id", { ascending: true });
    if (questionRowsErr) throw new Error(`Load question_bank_questions error: ${questionRowsErr.message}`);

    const questionRows = (Array.isArray(questionRowsRaw) ? questionRowsRaw : []) as QuestionBankRow[];
    const questionUpdateLimit = Math.min(questionRows.length, inputQuestions.length);
    for (let batchIndex = 0; batchIndex < questionUpdateLimit; batchIndex += 1) {
      const row = questionRows[batchIndex];
      const originalEntry = questionEntries[batchIndex];
      const normalizedOriginal = originalEntry?.normalized;
      const question = correctedByBatchIndex.get(batchIndex) ?? normalizedOriginal;
      if (!question) continue;

      const nextQuestionMetadata = {
        ...((row.metadata as Record<string, unknown> | null) ?? {}),
        validation: {
          source: "bank_validate_and_fix",
          validated_at: validatedAt,
          bank_test_id: bankTestId,
        },
      };

      const { error: updateQuestionErr } = await supabase
        .from("question_bank_questions")
        .update({
          topic_id: question.topicId,
          topic_label: question.topicLabel,
          question: question.question,
          options: question.options,
          correct_option_id: question.correctOptionId,
          explanation: question.explanation,
          citations: question.citations,
          status: nextStatus,
          validated_at: validatedAt,
          prompt_version: "bank-validate-v1",
          metadata: nextQuestionMetadata,
        })
        .eq("id", row.id);
      if (updateQuestionErr) throw new Error(`Update question_bank_questions error: ${updateQuestionErr.message}`);

      const { error: deleteSourcesErr } = await supabase
        .from("question_bank_question_sources")
        .delete()
        .eq("question_id", row.id);
      if (deleteSourcesErr) 
        throw new Error(`Delete question_bank_question_sources error: ${deleteSourcesErr.message}`);
      

      const sourcePayload = question.citations
        .map((citation) => {
          const source = sourceByChunkId.get(citation.chunkId);
          if (!source) return null;
          return {
            question_id: row.id,
            chunk_id: source.chunk_id,
            id_boe: citation.idBoe || source.id_boe,
            article: citation.article || source.article,
            reference: citation.reference || source.reference,
            unit_type: source.unit_type,
            score: source.score,
            title: source.title,
            snippet: source.snippet,
            raw_chunk: source.raw_chunk ?? {},
          };
        })
        .filter((item): item is Record<string, unknown> => Boolean(item));

      if (sourcePayload.length > 0) {
        const { error: insertSourcesErr } = await supabase
          .from("question_bank_question_sources")
          .insert(sourcePayload);
        if (insertSourcesErr) 
          throw new Error(`Insert question_bank_question_sources error: ${insertSourcesErr.message}`);
        
      }
    }

    return json({
      ok: true,
      bank_test_id: bankTestId,
      status: nextStatus,
      validated_at: validatedAt,
      questions_total: finalBatchQuestions.length,
      questions_processed: normalizedEntries.length,
      results: validationDetails,
    });
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
