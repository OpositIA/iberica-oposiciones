import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type SelectedTopicInput = {
  id?: unknown;
  label?: unknown;
  scope?: unknown;
};

type GenerateQuickTestRequest = {
  oppositionId?: unknown;
  opposition_id?: unknown;
  oppositionName?: unknown;
  opposition_name?: unknown;
  questionCount?: unknown;
  question_count?: unknown;
  locale?: unknown;
  selectedTopics?: unknown;
  selected_topics?: unknown;
};

type NormalizedSelectedTopic = {
  id: string;
  label: string;
  scope: "topic" | "block";
};

type ResolvedSubtopicSelection = {
  topicId: string;
  topicLabel: string;
  subtopicId: string;
  subtopicLabel: string;
};

type QuestionBankRow = {
  id: number;
  opposition_name: string | null;
  topic_id: string | null;
  topic_label: string | null;
  subtopic_id: string | null;
  subtopic_label: string | null;
  question: string | null;
  options: unknown;
  correct_option_id: string | null;
  explanation: string | null;
  citations: unknown;
};

type NormalizedOption = { id: "A" | "B" | "C" | "D"; text: string };

type OppositionTopicRow = {
  id: number;
  topic_code: string | null;
  topic_title: string | null;
};

type OppositionSubtopicRow = {
  opposition_topic_id: number;
  subtopic_code: string | null;
  subtopic_title: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

const clampQuestionCount = (value: unknown) =>
  sanitizeInteger(value, { min: 1, max: 100 });

const normalizeKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
};

const normalizeOptionText = (input: unknown): string => {
  if (typeof input === "string") return input.trim();
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const maybe = input as Record<string, unknown>;
  return String(
    maybe.text ??
      maybe.label ??
      maybe.content ??
      maybe.option ??
      maybe.answer ??
      ""
  ).trim();
};

const normalizeOptions = (optionsRaw: unknown): NormalizedOption[] => {
  const ids: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  if (Array.isArray(optionsRaw)) {
    if (optionsRaw.length < 4) return [];
    const arr = optionsRaw.slice(0, 4);

    const hasIds = arr.some(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).id === "string"
    );

    if (hasIds) {
      const byId = new Map<string, string>();
      for (const item of arr) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const rec = item as Record<string, unknown>;
        const id = String(rec.id ?? rec.optionId ?? rec.key ?? "")
          .trim()
          .toUpperCase();
        const text = normalizeOptionText(rec);
        if (id && text) byId.set(id, text);
      }
      if (ids.every((id) => byId.has(id))) {
        return ids.map((id) => ({ id, text: byId.get(id)! }));
      }
    }

    const texts = arr.map((item) => {
      const normalized = normalizeOptionText(item);
      if (normalized) return normalized;
      return String(item ?? "").trim();
    });
    if (texts.some((text) => !text)) return [];
    return ids.map((id, idx) => ({ id, text: texts[idx] }));
  }

  if (optionsRaw && typeof optionsRaw === "object") {
    const rec = optionsRaw as Record<string, unknown>;
    if (ids.every((id) => Object.prototype.hasOwnProperty.call(rec, id))) {
      const built = ids.map((id) => ({
        id,
        text: normalizeOptionText(rec[id]) || String(rec[id] ?? "").trim()
      }));
      if (built.every((option) => option.text)) return built;
    }
  }

  return [];
};

const normalizeCorrectOptionId = (
  raw: unknown,
  options: NormalizedOption[]
): "A" | "B" | "C" | "D" => {
  const ids: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  if (typeof raw === "string") {
    const folded = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
    if (ids.includes(folded as "A" | "B" | "C" | "D")) {
      return folded as "A" | "B" | "C" | "D";
    }

    const keywordMatch = folded.match(
      /(?:OPCION|RESPUESTA|CORRECTA|ALTERNATIVA)\s*[:-]?\s*([ABCD])(?:\b|[).])/
    );
    if (
      keywordMatch?.[1] &&
      ids.includes(keywordMatch[1] as "A" | "B" | "C" | "D")
    ) {
      return keywordMatch[1] as "A" | "B" | "C" | "D";
    }

    const compactMatch = folded.match(/(?:^|[^A-Z])([ABCD])\s*[).:-]?\s*$/);
    if (
      compactMatch?.[1] &&
      ids.includes(compactMatch[1] as "A" | "B" | "C" | "D")
    ) {
      return compactMatch[1] as "A" | "B" | "C" | "D";
    }

    const isolatedMatch = folded.match(/\b([ABCD])\b/);
    if (
      isolatedMatch?.[1] &&
      ids.includes(isolatedMatch[1] as "A" | "B" | "C" | "D")
    ) {
      return isolatedMatch[1] as "A" | "B" | "C" | "D";
    }

    const asNum = Number.parseInt(folded, 10);
    if (Number.isFinite(asNum)) {
      if (asNum >= 0 && asNum <= 3) return ids[asNum];
      if (asNum >= 1 && asNum <= 4) return ids[asNum - 1];
    }

    const byTextIdx = options.findIndex(
      (option) => option.text.toLowerCase() === folded.toLowerCase()
    );
    if (byTextIdx >= 0) return ids[byTextIdx];
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const idx = Math.floor(raw);
    if (idx >= 0 && idx <= 3) return ids[idx];
    if (idx >= 1 && idx <= 4) return ids[idx - 1];
  }

  return "A";
};

const shuffleQuestionOptions = (
  options: NormalizedOption[],
  correctOptionId: "A" | "B" | "C" | "D"
) => {
  const shuffled = shuffleInPlace([...options]);
  const remappedIds: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  const normalizedOptions = shuffled.map((option, idx) => ({
    id: remappedIds[idx],
    text: option.text
  }));
  const correctText = options.find(
    (option) => option.id === correctOptionId
  )?.text;
  const normalizedCorrect =
    normalizedOptions.find((option) => option.text === correctText)?.id ?? "A";

  return {
    options: normalizedOptions,
    correctOptionId: normalizedCorrect
  };
};

const normalizeSelectedTopics = (raw: unknown): NormalizedSelectedTopic[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const normalized: NormalizedSelectedTopic[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const topic = item as SelectedTopicInput;
    const id = sanitizeCode(topic.id, 160);
    const label = sanitizeSingleLineText(topic.label, 220);
    const scope = topic.scope === "block" ? "block" : "topic";
    if (!id && !label) continue;
    const key = `${scope}::${normalizeKey(id)}::${normalizeKey(label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, label, scope });
    if (normalized.length >= 200) break;
  }

  return normalized;
};

const loadOppositionSubtopics = async (
  serviceClient: ReturnType<typeof createClient>,
  oppositionId: string
): Promise<{
  blocksByCode: Map<string, ResolvedSubtopicSelection[]>;
  subtopicsByCode: Map<string, ResolvedSubtopicSelection>;
  subtopicsByLabelKey: Map<string, ResolvedSubtopicSelection>;
}> => {
  const { data: syllabusRow } = await serviceClient
    .from("opposition_syllabi")
    .select("id")
    .eq("opposition_id", oppositionId)
    .eq("is_current", true)
    .maybeSingle();

  let topicsQuery = serviceClient
    .from("opposition_topics")
    .select("id, topic_code, topic_title")
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  topicsQuery = syllabusRow?.id
    ? topicsQuery.eq("syllabus_id", syllabusRow.id)
    : topicsQuery.eq("opposition_id", oppositionId);

  const { data: topicRows, error: topicError } = await topicsQuery;
  if (topicError) throw topicError;

  const normalizedTopicRows = (
    Array.isArray(topicRows) ? topicRows : []
  ) as OppositionTopicRow[];
  const topicIds = normalizedTopicRows
    .map((row) => Number(row.id))
    .filter((value) => Number.isFinite(value));

  const { data: subtopicRows, error: subtopicError } = topicIds.length
    ? await serviceClient
        .from("opposition_subtopics")
        .select("opposition_topic_id, subtopic_code, subtopic_title")
        .in("opposition_topic_id", topicIds)
        .order("order_index", { ascending: true })
        .order("id", { ascending: true })
    : { data: [], error: null };

  if (subtopicError) throw subtopicError;

  const topicById = new Map<number, OppositionTopicRow>();
  normalizedTopicRows.forEach((row) => {
    const topicId = Number(row.id);
    if (Number.isFinite(topicId)) topicById.set(topicId, row);
  });

  const blocksByCode = new Map<string, ResolvedSubtopicSelection[]>();
  const subtopicsByCode = new Map<string, ResolvedSubtopicSelection>();
  const subtopicsByLabelKey = new Map<string, ResolvedSubtopicSelection>();

  (
    (Array.isArray(subtopicRows) ? subtopicRows : []) as OppositionSubtopicRow[]
  ).forEach((row) => {
    const parentTopic = topicById.get(Number(row.opposition_topic_id));
    const topicCode = sanitizeCode(parentTopic?.topic_code, 160);
    const topicLabel = sanitizeSingleLineText(parentTopic?.topic_title, 220);
    const subtopicCode = sanitizeCode(row.subtopic_code, 160);
    const subtopicLabel = sanitizeSingleLineText(row.subtopic_title, 220);
    if (!topicCode || !subtopicCode || !subtopicLabel) return;

    const normalized: ResolvedSubtopicSelection = {
      topicId: topicCode,
      topicLabel: topicLabel || topicCode,
      subtopicId: subtopicCode,
      subtopicLabel
    };

    if (!blocksByCode.has(topicCode)) blocksByCode.set(topicCode, []);
    blocksByCode.get(topicCode)?.push(normalized);
    subtopicsByCode.set(subtopicCode, normalized);
    const labelKey = normalizeKey(subtopicLabel);
    if (labelKey && !subtopicsByLabelKey.has(labelKey)) {
      subtopicsByLabelKey.set(labelKey, normalized);
    }
  });

  return { blocksByCode, subtopicsByCode, subtopicsByLabelKey };
};

const resolveSelectedSubtopics = (
  requestedTopics: NormalizedSelectedTopic[],
  structure: {
    blocksByCode: Map<string, ResolvedSubtopicSelection[]>;
    subtopicsByCode: Map<string, ResolvedSubtopicSelection>;
    subtopicsByLabelKey: Map<string, ResolvedSubtopicSelection>;
  }
) => {
  const resolved = new Map<string, ResolvedSubtopicSelection>();
  const unresolved: NormalizedSelectedTopic[] = [];

  requestedTopics.forEach((requestedTopic) => {
    if (requestedTopic.scope === "block") {
      const blockSubtopics =
        structure.blocksByCode.get(requestedTopic.id) ?? [];
      if (blockSubtopics.length === 0) {
        unresolved.push(requestedTopic);
        return;
      }
      blockSubtopics.forEach((subtopic) => {
        resolved.set(subtopic.subtopicId, subtopic);
      });
      return;
    }

    const byCode = structure.subtopicsByCode.get(requestedTopic.id);
    if (byCode) {
      resolved.set(byCode.subtopicId, byCode);
      return;
    }

    const byLabel = structure.subtopicsByLabelKey.get(
      normalizeKey(requestedTopic.label)
    );
    if (byLabel) {
      resolved.set(byLabel.subtopicId, byLabel);
      return;
    }

    unresolved.push(requestedTopic);
  });

  return {
    resolved: Array.from(resolved.values()),
    unresolved
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let parsedBody: GenerateQuickTestRequest;
  try {
    parsedBody = await parseJsonBody<GenerateQuickTestRequest>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body") {
      return json({ error: error.message }, 400);
    }
    throw error;
  }

  const oppositionId = sanitizeCode(
    parsedBody.oppositionId ?? parsedBody.opposition_id,
    120
  );
  const oppositionName = sanitizeSingleLineText(
    parsedBody.oppositionName ?? parsedBody.opposition_name,
    160
  );
  const localeRaw = sanitizeCode(parsedBody.locale, 12).toLowerCase();
  const locale = localeRaw === "es" ? "es" : "es";
  const questionCount = clampQuestionCount(
    parsedBody.questionCount ?? parsedBody.question_count
  );
  const requestedTopics = normalizeSelectedTopics(
    parsedBody.selectedTopics ?? parsedBody.selected_topics
  );

  if (!oppositionId || !questionCount || requestedTopics.length === 0) {
    return json(
      {
        error:
          "Missing or invalid params: oppositionId, questionCount (1..100), selectedTopics[]"
      },
      400
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const userId = user.id;
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: planRows, error: planError } = await serviceClient.rpc(
    "get_user_plan_state",
    {
      p_user_id: userId,
      p_tz: "Europe/Madrid"
    }
  );
  if (planError) {
    return json(
      { error: `Could not load user plan state: ${planError.message}` },
      500
    );
  }

  const planRow =
    Array.isArray(planRows) &&
    planRows.length > 0 &&
    planRows[0] &&
    typeof planRows[0] === "object"
      ? (planRows[0] as Record<string, unknown>)
      : null;
  const isPaidPlan =
    Boolean(planRow?.is_paid) ||
    sanitizeCode(planRow?.tier, 32).toLowerCase() === "pro";
  if (!isPaidPlan) {
    return json({ error: "quick_test_requires_paid_plan" }, 403);
  }

  let structure;
  try {
    structure = await loadOppositionSubtopics(serviceClient, oppositionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown structure error";
    return json(
      { error: `Could not load opposition subtopics: ${message}` },
      500
    );
  }

  const { resolved: resolvedSubtopics, unresolved } = resolveSelectedSubtopics(
    requestedTopics,
    structure
  );

  if (resolvedSubtopics.length === 0) {
    return json(
      {
        error:
          "Selected topics did not match any subtopic in the current syllabus for this opposition."
      },
      409
    );
  }

  if (unresolved.length > 0) {
    const missingTopics = unresolved
      .map((topic) => topic.label || topic.id)
      .filter((value) => value.length > 0)
      .slice(0, 5);
    const suffix = unresolved.length > 5 ? ", ..." : "";
    return json(
      {
        error: `No hay subtemas vÃĄlidos para la selecciÃģn actual: ${missingTopics.join(", ")}${suffix}.`
      },
      409
    );
  }

  if (questionCount < resolvedSubtopics.length) {
    return json(
      {
        error: `El nÃšmero mÃ­nimo de preguntas debe ser ${resolvedSubtopics.length}, porque has seleccionado ${resolvedSubtopics.length} temas.`
      },
      409
    );
  }

  const selectedSubtopicIds = resolvedSubtopics.map(
    (subtopic) => subtopic.subtopicId
  );
  const { data: questionRows, error: questionRowsError } = await serviceClient
    .from("question_bank_questions")
    .select(
      "id, opposition_name, topic_id, topic_label, subtopic_id, subtopic_label, question, options, correct_option_id, explanation, citations"
    )
    .eq("opposition_id", oppositionId)
    .eq("locale", locale)
    .in("status", ["validated", "published", "draft"])
    .in("subtopic_id", selectedSubtopicIds)
    .limit(10000);

  if (questionRowsError) {
    return json(
      {
        error: `Could not load question bank rows: ${questionRowsError.message}`
      },
      500
    );
  }

  const groupedBySubtopic = new Map<string, QuestionBankRow[]>();
  (
    (Array.isArray(questionRows) ? questionRows : []) as QuestionBankRow[]
  ).forEach((row) => {
    const subtopicId = sanitizeCode(row.subtopic_id, 160);
    if (!subtopicId) return;
    if (!groupedBySubtopic.has(subtopicId))
      groupedBySubtopic.set(subtopicId, []);
    groupedBySubtopic.get(subtopicId)?.push(row);
  });

  const coveredSubtopics = resolvedSubtopics.filter(
    (subtopic) => (groupedBySubtopic.get(subtopic.subtopicId)?.length ?? 0) > 0
  );
  const missingCoverage = resolvedSubtopics
    .filter(
      (subtopic) =>
        (groupedBySubtopic.get(subtopic.subtopicId)?.length ?? 0) === 0
    )
    .map((subtopic) => subtopic.subtopicLabel);

  if (coveredSubtopics.length === 0) {
    const preview = missingCoverage.slice(0, 6).join(", ");
    const suffix = missingCoverage.length > 6 ? ", ..." : "";
    return json(
      {
        error: `Faltan preguntas en la banca para estos temas: ${preview}${suffix}.`
      },
      409
    );
  }

  const totalAvailable = Array.from(groupedBySubtopic.values()).reduce(
    (acc, rows) => acc + rows.length,
    0
  );
  const effectiveQuestionCount = Math.max(
    coveredSubtopics.length,
    Math.min(questionCount, totalAvailable)
  );

  const pools = new Map<string, QuestionBankRow[]>();
  coveredSubtopics.forEach((subtopic) => {
    pools.set(
      subtopic.subtopicId,
      shuffleInPlace([...(groupedBySubtopic.get(subtopic.subtopicId) ?? [])])
    );
  });

  const selectedRows: QuestionBankRow[] = [];
  const seenIds = new Set<number>();

  coveredSubtopics.forEach((subtopic) => {
    const pool = pools.get(subtopic.subtopicId) ?? [];
    const next = pool.shift();
    if (!next) return;
    if (seenIds.has(next.id)) return;
    seenIds.add(next.id);
    selectedRows.push(next);
  });

  while (selectedRows.length < effectiveQuestionCount) {
    const shuffledSubtopics = shuffleInPlace([...coveredSubtopics]);
    let progressed = false;

    for (const subtopic of shuffledSubtopics) {
      if (selectedRows.length >= effectiveQuestionCount) break;
      const pool = pools.get(subtopic.subtopicId) ?? [];
      while (pool.length > 0) {
        const next = pool.shift()!;
        if (seenIds.has(next.id)) continue;
        seenIds.add(next.id);
        selectedRows.push(next);
        progressed = true;
        break;
      }
    }

    if (!progressed) break;
  }

  const questions = shuffleInPlace([...selectedRows])
    .slice(0, effectiveQuestionCount)
    .map((row, idx) => {
      const statement = String(row.question ?? "").trim();
      if (!statement) return null;
      const options = normalizeOptions(row.options);
      if (options.length !== 4) return null;
      const correctOptionId = normalizeCorrectOptionId(
        row.correct_option_id,
        options
      );
      const shuffledQuestion = shuffleQuestionOptions(options, correctOptionId);
      const citations = Array.isArray(row.citations) ? row.citations : [];

      return {
        id: `bank-question-${row.bank_question_id ?? idx + 1}`,
        bankQuestionId: Number(row.bank_question_id),
        topicId: String(row.topic_id ?? "").trim(),
        topicLabel: sanitizeSingleLineText(row.topic_label, 220),
        subtopicId: sanitizeCode(row.subtopic_id, 160),
        subtopicLabel: sanitizeSingleLineText(row.subtopic_label, 220),
        question: statement,
        options: shuffledQuestion.options,
        correctOptionId: shuffledQuestion.correctOptionId,
        explanation:
          String(row.explanation ?? "").trim() ||
          "Respuesta basada en el texto legal citado.",
        citations
      };
    })
    .filter((question): question is NonNullable<typeof question> =>
      Boolean(question)
    );

  if (questions.length === 0) {
    return json({ error: "Selected questions could not be normalized" }, 409);
  }

  return json({
    testId: crypto.randomUUID(),
    oppositionId,
    oppositionName:
      oppositionName ||
      sanitizeSingleLineText(selectedRows[0]?.opposition_name, 160) ||
      oppositionId,
    questionCount: questions.length,
    selectedTopics: requestedTopics,
    questions
  });
});
