import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText,
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

type TopicCandidate = {
  topicId: string;
  topicLabel: string;
};

type ResolvedTopicSelection = {
  requestedId: string;
  requestedLabel: string;
  topicId: string;
  topicLabel: string;
  scope: "topic" | "block";
};

type ClaimBankQuestionRow = {
  bank_question_id: number;
  opposition_name: string | null;
  topic_id: string | null;
  topic_label: string | null;
  difficulty: string | null;
  locale: string | null;
  question: string | null;
  options: unknown;
  correct_option_id: string | null;
  explanation: string | null;
  citations: unknown;
  model: string | null;
};

type NormalizedOption = { id: "A" | "B" | "C" | "D"; text: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const clampQuestionCount = (value: unknown) =>
  sanitizeInteger(value, { min: 1, max: 100 });

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
      "",
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
        typeof (item as Record<string, unknown>).id === "string",
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
      if (ids.every((id) => byId.has(id)))
        return ids.map((id) => ({ id, text: byId.get(id)! }));
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
        text: normalizeOptionText(rec[id]) || String(rec[id] ?? "").trim(),
      }));
      if (built.every((option) => option.text)) return built;
    }
  }

  return [];
};

const normalizeCorrectOptionId = (
  raw: unknown,
  options: NormalizedOption[],
): "A" | "B" | "C" | "D" => {
  const ids: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  if (typeof raw === "string") {
    const folded = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
    if (ids.includes(folded as "A" | "B" | "C" | "D"))
      return folded as "A" | "B" | "C" | "D";

    const keywordMatch = folded.match(
      /(?:OPCION|RESPUESTA|CORRECTA|ALTERNATIVA)\s*[:-]?\s*([ABCD])(?:\b|[).])/,
    );
    if (keywordMatch?.[1] && ids.includes(keywordMatch[1] as "A" | "B" | "C" | "D"))
      return keywordMatch[1] as "A" | "B" | "C" | "D";

    const compactMatch = folded.match(/(?:^|[^A-Z])([ABCD])\s*[).:-]?\s*$/);
    if (compactMatch?.[1] && ids.includes(compactMatch[1] as "A" | "B" | "C" | "D"))
      return compactMatch[1] as "A" | "B" | "C" | "D";

    const isolatedMatch = folded.match(/\b([ABCD])\b/);
    if (isolatedMatch?.[1] && ids.includes(isolatedMatch[1] as "A" | "B" | "C" | "D"))
      return isolatedMatch[1] as "A" | "B" | "C" | "D";

    const asNum = Number.parseInt(folded, 10);
    if (Number.isFinite(asNum)) {
      if (asNum >= 0 && asNum <= 3) return ids[asNum];
      if (asNum >= 1 && asNum <= 4) return ids[asNum - 1];
    }
    const byTextIdx = options.findIndex(
      (opt) => opt.text.toLowerCase() === folded.toLowerCase(),
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

const normalizeKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const extractBlockCode = (value: string) => {
  const safeValue = sanitizeCode(value, 120);
  if (!safeValue) return "";
  const [blockCode] = safeValue.split(":");
  return sanitizeCode(blockCode, 120);
};

const tokenizeKey = (value: string) =>
  normalizeKey(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const scoreTopicMatch = (
  selected: NormalizedSelectedTopic,
  candidate: TopicCandidate,
): number => {
  let score = 0;
  const selectedId = sanitizeCode(selected.id, 120);
  const selectedBlockCode = extractBlockCode(selected.id);
  const candidateId = sanitizeCode(candidate.topicId, 120);

  if (selectedId && candidateId && selectedId === candidateId) score = 1200;
  else if (
    selectedId &&
    candidateId &&
    normalizeKey(selectedId) === normalizeKey(candidateId)
  ) 
    score = 1100;

  if (
    selectedBlockCode &&
    candidateId &&
    normalizeKey(selectedBlockCode) === normalizeKey(candidateId)
  ) {
    score = Math.max(score, 250);
  }

  const selectedLabelKey = normalizeKey(selected.label);
  const candidateLabelKey = normalizeKey(candidate.topicLabel);
  if (!selectedLabelKey || !candidateLabelKey) return score;

  if (selectedLabelKey === candidateLabelKey) return Math.max(score, 1000);

  if (
    candidateLabelKey.startsWith(selectedLabelKey) ||
    selectedLabelKey.startsWith(candidateLabelKey)
  ) {
    const distance = Math.abs(candidateLabelKey.length - selectedLabelKey.length);
    return Math.max(score, 900 - Math.min(250, distance));
  }

  const selectedTokens = tokenizeKey(selected.label);
  const candidateTokens = new Set(tokenizeKey(candidate.topicLabel));
  if (selectedTokens.length === 0 || candidateTokens.size === 0) return score;

  const shared = selectedTokens.filter((token) => candidateTokens.has(token));
  if (shared.length === 0) return score;

  const overlapRatio = shared.length / selectedTokens.length;
  let tokenScore = Math.round(overlapRatio * 700);
  const selectedNumeric = selectedTokens.filter((token) => /^\d+$/.test(token));
  if (selectedNumeric.some((token) => candidateTokens.has(token))) tokenScore += 120;

  return Math.max(score, tokenScore);
};

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
};

const normalizeSelectedTopics = (raw: unknown): NormalizedSelectedTopic[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const normalized: NormalizedSelectedTopic[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const topic = item as SelectedTopicInput;
    const id = sanitizeCode(topic.id, 120);
    const label = sanitizeSingleLineText(topic.label, 220);
    const scope = topic.scope === "block" ? "block" : "topic";
    if (!id && !label) continue;
    const key = `${scope}::${normalizeKey(id)}::${normalizeKey(label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ id, label, scope });
    if (normalized.length >= 100) break;
  }

  return normalized;
};

const resolveRequestedTopics = (
  requestedTopics: NormalizedSelectedTopic[],
  candidates: TopicCandidate[],
): {
  resolved: ResolvedTopicSelection[];
  unresolved: NormalizedSelectedTopic[];
} => {
  const resolvedByKey = new Map<string, ResolvedTopicSelection>();
  const unresolved: NormalizedSelectedTopic[] = [];

  for (const requestedTopic of requestedTopics) {
    if (requestedTopic.scope === "block") {
      const requestedBlockCode = extractBlockCode(requestedTopic.id);
      const blockCandidate = candidates.find((candidate) => {
        const candidateId = sanitizeCode(candidate.topicId, 120);
        return (
          Boolean(requestedBlockCode) &&
          normalizeKey(candidateId) === normalizeKey(requestedBlockCode)
        );
      });

      if (blockCandidate) {
        const resolvedKey = `block::${blockCandidate.topicId}`;
        if (!resolvedByKey.has(resolvedKey)) {
          resolvedByKey.set(resolvedKey, {
            requestedId: requestedTopic.id,
            requestedLabel: requestedTopic.label,
            topicId: blockCandidate.topicId,
            topicLabel: requestedTopic.label || blockCandidate.topicLabel,
            scope: "block",
          });
        }
        continue;
      }
    }

    let bestCandidate: TopicCandidate | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = scoreTopicMatch(requestedTopic, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && bestScore >= 700) {
      const resolvedKey = `${bestCandidate.topicId}::${normalizeKey(bestCandidate.topicLabel)}`;
      if (!resolvedByKey.has(resolvedKey)) {
        resolvedByKey.set(resolvedKey, {
          requestedId: requestedTopic.id,
          requestedLabel: requestedTopic.label,
          topicId: bestCandidate.topicId,
          topicLabel: bestCandidate.topicLabel,
          scope: "topic",
        });
      }
      continue;
    }

    unresolved.push(requestedTopic);
  }

  return {
    resolved: Array.from(resolvedByKey.values()),
    unresolved,
  };
};

const allocatePerTopic = (
  selections: ResolvedTopicSelection[],
  targetQuestionCount: number,
): Array<ResolvedTopicSelection & { questionCount: number }> => {
  if (selections.length === 0 || targetQuestionCount <= 0) return [];

  const shuffledSelections = shuffleInPlace([...selections]);
  const base = Math.floor(targetQuestionCount / shuffledSelections.length);
  let remainder = targetQuestionCount % shuffledSelections.length;

  return shuffledSelections
    .map((selection) => {
      const plusOne = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      return {
        ...selection,
        questionCount: base + plusOne,
      };
    })
    .filter((entry) => entry.questionCount > 0);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) 
    return json({ error: "Missing Supabase environment variables" }, 500);
  

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let parsedBody: GenerateQuickTestRequest;
  try {
    parsedBody = await parseJsonBody<GenerateQuickTestRequest>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body") 
      return json({ error: error.message }, 400);
    
    throw error;
  }

  const oppositionId = sanitizeCode(
    parsedBody.oppositionId ?? parsedBody.opposition_id,
    120,
  );
  const oppositionName = sanitizeSingleLineText(
    parsedBody.oppositionName ?? parsedBody.opposition_name,
    160,
  );
  const localeRaw = sanitizeCode(parsedBody.locale, 12).toLowerCase();
  const locale = localeRaw === "es" ? "es" : "es";
  const questionCount = clampQuestionCount(
    parsedBody.questionCount ?? parsedBody.question_count,
  );
  const requestedTopics = normalizeSelectedTopics(
    parsedBody.selectedTopics ?? parsedBody.selected_topics,
  );

  if (!oppositionId || !questionCount || requestedTopics.length === 0) {
    return json(
      {
        error:
          "Missing or invalid params: oppositionId, questionCount (1..100), selectedTopics[]",
      },
      400,
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const userId = user.id;
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: planRows, error: planError } = await serviceClient.rpc(
    "get_user_plan_state",
    {
      p_user_id: userId,
      p_tz: "Europe/Madrid",
    },
  );
  if (planError) {
    return json(
      { error: `Could not load user plan state: ${planError.message}` },
      500,
    );
  }

  const planRow =
    Array.isArray(planRows) && planRows.length > 0 && planRows[0] &&
      typeof planRows[0] === "object"
      ? (planRows[0] as Record<string, unknown>)
      : null;
  const isPaidPlan = Boolean(planRow?.is_paid) ||
    sanitizeCode(planRow?.tier, 32).toLowerCase() === "pro";
  if (!isPaidPlan) {
    return json(
      { error: "quick_test_requires_paid_plan" },
      403,
    );
  }

  const { data: topicRows, error: topicRowsError } = await serviceClient
    .from("question_bank_questions")
    .select("topic_id, topic_label")
    .eq("opposition_id", oppositionId)
    .eq("locale", locale)
    .in("status", ["validated", "published", "draft"])
    .limit(5000);

  if (topicRowsError) {
    return json(
      { error: `Could not load question bank topics: ${topicRowsError.message}` },
      500,
    );
  }

  const topicCandidatesMap = new Map<string, TopicCandidate>();
  for (const row of Array.isArray(topicRows) ? topicRows : []) {
    const topicId = sanitizeCode((row as { topic_id?: unknown }).topic_id, 120);
    const topicLabel = sanitizeSingleLineText(
      (row as { topic_label?: unknown }).topic_label,
      220,
    );
    if (!topicId || !topicLabel) continue;
    const candidateKey = `${topicId}::${normalizeKey(topicLabel)}`;
    if (!topicCandidatesMap.has(candidateKey))
      topicCandidatesMap.set(candidateKey, { topicId, topicLabel });
  }
  const topicCandidates = Array.from(topicCandidatesMap.values());
  if (topicCandidates.length === 0) {
    return json(
      { error: "No questions available in question bank for this opposition." },
      409,
    );
  }

  const { resolved: resolvedTopics, unresolved } = resolveRequestedTopics(
    requestedTopics,
    topicCandidates,
  );
  if (resolvedTopics.length === 0) {
    return json(
      {
        error:
          "Selected topics did not match any topic in question bank for this opposition.",
      },
      409,
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
        error: `No hay preguntas disponibles para los temas seleccionados: ${missingTopics.join(", ")}${suffix}.`,
      },
      409,
    );
  }

  const selectedTopicIds = Array.from(new Set(resolvedTopics.map((topic) => topic.topicId)));
  const { data: selectedQuestionRows, error: selectedQuestionRowsError } =
    await serviceClient
      .from("question_bank_questions")
      .select("id, topic_id, topic_label")
      .eq("opposition_id", oppositionId)
      .eq("locale", locale)
      .in("status", ["validated", "published", "draft"])
      .in("topic_id", selectedTopicIds)
      .limit(10000);

  if (selectedQuestionRowsError) {
    return json(
      {
        error: `Could not load question counts for selected topics: ${selectedQuestionRowsError.message}`,
      },
      500,
    );
  }

  const resolvedTopicKeys = new Set(
    resolvedTopics.map(
      (topic) =>
        topic.scope === "block"
          ? `block::${topic.topicId}`
          : `${topic.topicId}::${normalizeKey(topic.topicLabel)}`,
    ),
  );
  const availableQuestionIds = new Set<number>();
  for (const row of Array.isArray(selectedQuestionRows) ? selectedQuestionRows : []) {
    const topicId = sanitizeCode((row as { topic_id?: unknown }).topic_id, 120);
    const topicLabel = sanitizeSingleLineText(
      (row as { topic_label?: unknown }).topic_label,
      220,
    );
    const questionId = Number((row as { id?: unknown }).id);
    const matchesBlock = resolvedTopicKeys.has(`block::${topicId}`);
    const questionKey = `${topicId}::${normalizeKey(topicLabel)}`;
    if (
      (!matchesBlock && !resolvedTopicKeys.has(questionKey)) ||
      !Number.isFinite(questionId)
    )
      continue;
    availableQuestionIds.add(questionId);
  }

  if (availableQuestionIds.size < questionCount) {
    return json(
      {
        error: `No hay suficientes preguntas para la seleccion actual. Disponibles: ${availableQuestionIds.size}. Solicitadas: ${questionCount}.`,
      },
      409,
    );
  }

  const initialAllocation = allocatePerTopic(resolvedTopics, questionCount);

  const seenQuestionIds = new Set<number>();
  const claimedRows: ClaimBankQuestionRow[] = [];
  const claimForTopic = async (
    topicId: string,
    topicLabel: string | null,
    count: number,
  ) => {
    if (count <= 0) return;
    const { data, error } = await serviceClient.rpc("claim_question_bank_questions", {
      p_user_id: userId,
      p_opposition_id: oppositionId,
      p_topic_id: topicId,
      p_topic_label:
        typeof topicLabel === "string" && topicLabel.trim().length > 0
          ? topicLabel
          : null,
      p_question_count: count,
      p_locale: locale,
      p_include_draft: true,
    });
    if (error) throw new Error(error.message);

    for (const row of Array.isArray(data) ? (data as ClaimBankQuestionRow[]) : []) {
      const questionId = Number(row.bank_question_id);
      if (!Number.isFinite(questionId) || seenQuestionIds.has(questionId)) continue;
      seenQuestionIds.add(questionId);
      claimedRows.push(row);
    }
  };

  try {
    for (const slot of initialAllocation) 
      await claimForTopic(
        slot.topicId,
        slot.scope === "block" ? null : slot.topicLabel,
        slot.questionCount,
      );


    let rounds = 0;
    while (claimedRows.length < questionCount && rounds < 8) {
      rounds += 1;
      const beforeRound = claimedRows.length;
      const shuffledTopics = shuffleInPlace([...resolvedTopics]);

      for (const topic of shuffledTopics) {
        if (claimedRows.length >= questionCount) break;
        const remaining = questionCount - claimedRows.length;
        await claimForTopic(
          topic.topicId,
          topic.scope === "block" ? null : topic.topicLabel,
          remaining,
        );
      }

      if (claimedRows.length === beforeRound) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown claim error";
    return json({ error: `RPC claim_question_bank_questions error: ${message}` }, 500);
  }

  if (claimedRows.length === 0) 
    return json({ error: "No bank questions available for selected topics" }, 409);

  if (claimedRows.length < questionCount) {
    return json(
      {
        error: `No se pudieron obtener suficientes preguntas para la seleccion actual. Disponibles: ${claimedRows.length}. Solicitadas: ${questionCount}.`,
      },
      409,
    );
  }

  const shuffledClaimedRows = shuffleInPlace([...claimedRows]).slice(0, questionCount);
  const questions = shuffledClaimedRows
    .map((row, idx) => {
      const statement = String(row.question ?? "").trim();
      if (!statement) return null;
      const options = normalizeOptions(row.options);
      if (options.length !== 4) return null;
      const correctOptionId = normalizeCorrectOptionId(row.correct_option_id, options);
      const citations = Array.isArray(row.citations) ? row.citations : [];

      return {
        id: `bank-question-${row.bank_question_id ?? idx + 1}`,
        topicId: String(row.topic_id ?? "").trim(),
        topicLabel: sanitizeSingleLineText(row.topic_label, 220),
        question: statement,
        options,
        correctOptionId,
        explanation:
          String(row.explanation ?? "").trim() ||
          "Respuesta basada en el texto legal citado.",
        citations,
      };
    })
    .filter((question): question is NonNullable<typeof question> => Boolean(question));

  if (questions.length === 0) 
    return json({ error: "Claimed questions could not be normalized" }, 409);
  

  return json({
    testId: crypto.randomUUID(),
    oppositionId,
    oppositionName:
      oppositionName ||
      sanitizeSingleLineText(shuffledClaimedRows[0]?.opposition_name, 160) ||
      oppositionId,
    questionCount: questions.length,
    selectedTopics: resolvedTopics.map((topic) => ({
      id: topic.topicId,
      label: topic.topicLabel,
      scope: topic.scope,
    })),
    questions,
  });
});
