import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  parseJsonBody,
  sanitizeCode,
  sanitizeInteger,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type ClaimBankRequest = {
  opposition_id?: string;
  oppositionName?: string;
  opposition_name?: string;
  topicId?: string;
  topic_id?: string;
  topicLabel?: string;
  topic_label?: string;
  question_count?: number;
  questionCount?: number;
  title?: string;
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

const pickFirstQuestionId = (questions: unknown[]): string | null => {
  const first = questions[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const q = first as Record<string, unknown>;

  const candidates = [q.id, q.questionId, q.uid];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0)
      return candidate.trim();
  }
  return null;
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
    if (ids.includes(folded as "A" | "B" | "C" | "D"))
      return folded as "A" | "B" | "C" | "D";

    const keywordMatch = folded.match(
      /(?:OPCION|RESPUESTA|CORRECTA|ALTERNATIVA)\s*[:-]?\s*([ABCD])(?:\b|[).])/
    );
    if (
      keywordMatch?.[1] &&
      ids.includes(keywordMatch[1] as "A" | "B" | "C" | "D")
    )
      return keywordMatch[1] as "A" | "B" | "C" | "D";

    const compactMatch = folded.match(/(?:^|[^A-Z])([ABCD])\s*[).:-]?\s*$/);
    if (
      compactMatch?.[1] &&
      ids.includes(compactMatch[1] as "A" | "B" | "C" | "D")
    )
      return compactMatch[1] as "A" | "B" | "C" | "D";

    const isolatedMatch = folded.match(/\b([ABCD])\b/);
    if (
      isolatedMatch?.[1] &&
      ids.includes(isolatedMatch[1] as "A" | "B" | "C" | "D")
    )
      return isolatedMatch[1] as "A" | "B" | "C" | "D";

    const asNum = Number.parseInt(folded, 10);
    if (Number.isFinite(asNum)) {
      if (asNum >= 0 && asNum <= 3) return ids[asNum];
      if (asNum >= 1 && asNum <= 4) return ids[asNum - 1];
    }
    const byTextIdx = options.findIndex(
      (opt) => opt.text.toLowerCase() === folded.toLowerCase()
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

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey)
    return json({ error: "Missing Supabase environment variables" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let params: ClaimBankRequest;
  try {
    const parsed = await parseJsonBody<ClaimBankRequest>(req);
    params = {
      ...parsed,
      opposition_id: sanitizeCode(parsed.opposition_id, 120),
      oppositionName: sanitizeSingleLineText(parsed.oppositionName, 160),
      opposition_name: sanitizeSingleLineText(parsed.opposition_name, 160),
      topicId: sanitizeCode(parsed.topicId, 120),
      topic_id: sanitizeCode(parsed.topic_id, 120),
      topicLabel: sanitizeSingleLineText(parsed.topicLabel, 160),
      topic_label: sanitizeSingleLineText(parsed.topic_label, 160),
      question_count:
        sanitizeInteger(parsed.question_count, { min: 1, max: 100 }) ??
        undefined,
      questionCount:
        sanitizeInteger(parsed.questionCount, { min: 1, max: 100 }) ??
        undefined,
      title: sanitizeSingleLineText(parsed.title, 160)
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const oppositionId = String(
    params.opposition_id ??
      params.opposition_name ??
      params.oppositionName ??
      ""
  ).trim();
  const topicId = sanitizeCode(params.topicId ?? params.topic_id ?? "", 120);
  const count = clampQuestionCount(
    params.question_count ?? params.questionCount
  );
  if (!oppositionId || !topicId || count === null) {
    return json(
      {
        error:
          "Missing or invalid params: opposition_id, topicId, question_count (1..100)"
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

  const { data: claimedRows, error: claimErr } = await serviceClient.rpc(
    "claim_question_bank_questions",
    {
      p_user_id: userId,
      p_opposition_id: oppositionId,
      p_topic_id: topicId,
      p_question_count: count,
      p_locale: "es",
      p_include_draft: true
    }
  );

  if (claimErr) {
    return json(
      { error: `RPC claim_question_bank_questions error: ${claimErr.message}` },
      500
    );
  }

  const rows = (
    Array.isArray(claimedRows) ? claimedRows : []
  ) as ClaimBankQuestionRow[];
  if (rows.length === 0)
    return json({ error: "No bank questions available for this filter" }, 409);

  const questions = rows
    .map((row, idx) => {
      const statement = String(row.question ?? "").trim();
      if (!statement) return null;
      const options = normalizeOptions(row.options);
      if (options.length !== 4) return null;
      const correctOptionId = normalizeCorrectOptionId(
        row.correct_option_id,
        options
      );
      const citations = Array.isArray(row.citations) ? row.citations : [];

      return {
        id: `bank-question-${row.bank_question_id ?? idx + 1}`,
        topicId: String(row.topic_id ?? "").trim() || topicId,
        topicLabel:
          sanitizeSingleLineText(row.topic_label, 160) ||
          sanitizeSingleLineText(
            params.topicLabel ?? params.topic_label,
            160
          ) ||
          topicId,
        question: statement,
        options,
        correctOptionId,
        explanation:
          String(row.explanation ?? "").trim() ||
          "Respuesta basada en el texto legal citado.",
        citations
      };
    })
    .filter((question): question is NonNullable<typeof question> =>
      Boolean(question)
    );

  if (questions.length === 0)
    return json({ error: "Claimed questions could not be normalized" }, 409);

  const topicLabel =
    sanitizeSingleLineText(params.topicLabel ?? params.topic_label, 160) ||
    sanitizeSingleLineText(rows[0]?.topic_label, 160) ||
    topicId;
  const oppositionName =
    sanitizeSingleLineText(
      params.opposition_name ?? params.oppositionName,
      160
    ) ||
    sanitizeSingleLineText(rows[0]?.opposition_name, 160) ||
    oppositionId;
  const servedDifficulties = [
    ...new Set(
      rows
        .map((row) =>
          String(row.difficulty ?? "")
            .trim()
            .toLowerCase()
        )
        .filter((difficulty) => difficulty.length > 0)
    )
  ];
  const modelName =
    rows
      .map((row) => String(row.model ?? "").trim())
      .find((model) => model.length > 0) ?? "bank-question-pool";
  const title =
    sanitizeSingleLineText(params.title, 160) ||
    sanitizeSingleLineText(`Test ${topicLabel}`, 160);
  const nowIso = new Date().toISOString();
  const firstQuestionId = pickFirstQuestionId(questions);
  const claimedQuestionIds = rows
    .map((row) => Number(row.bank_question_id))
    .filter((id) => Number.isFinite(id));

  const { data: quickTestRow, error: quickTestError } = await serviceClient
    .from("quick_tests")
    .insert({
      user_id: userId,
      opposition_id: oppositionId,
      opposition_name: oppositionName,
      locale: "es",
      title,
      question_count: questions.length,
      model: modelName,
      prompt_version: "served-from-question-pool-v1",
      metadata: {
        served_from: "question_bank_questions",
        served_at: nowIso,
        served_difficulties: servedDifficulties,
        question_ids: claimedQuestionIds
      },
      selected_topics: [
        {
          topicId,
          topicLabel
        }
      ],
      questions
    })
    .select("id")
    .single();

  if (quickTestError || !quickTestRow?.id) {
    return json(
      { error: quickTestError?.message ?? "Failed to create quick test" },
      500
    );
  }

  const quickTestId = String(quickTestRow.id);

  const { error: attemptError } = await serviceClient
    .from("quick_test_attempts")
    .upsert(
      {
        test_id: quickTestId,
        user_id: userId,
        selected_answers: {},
        active_question_id: firstQuestionId,
        started_at: nowIso,
        last_interaction_at: nowIso
      },
      {
        onConflict: "test_id,user_id"
      }
    );

  if (attemptError) {
    return json(
      { error: `Failed to initialize attempt: ${attemptError.message}` },
      500
    );
  }

  if (claimedQuestionIds.length > 0) {
    const { error: claimUpdateError } = await serviceClient
      .from("question_bank_question_claims")
      .update({ quick_test_id: quickTestId })
      .eq("user_id", userId)
      .in("question_id", claimedQuestionIds)
      .is("quick_test_id", null);

    if (claimUpdateError) {
      return json(
        {
          error: `Failed to update question claims: ${claimUpdateError.message}`
        },
        500
      );
    }
  }

  return json({
    testId: quickTestId,
    oppositionName,
    topicLabel,
    servedDifficulties,
    questionCount: questions.length,
    questions
  });
});
