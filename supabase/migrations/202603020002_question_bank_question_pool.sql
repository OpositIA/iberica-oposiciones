-- Question-centric bank model: one row per question, with claim-by-question.

CREATE TABLE IF NOT EXISTS public.question_bank_questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_bank_test_id UUID REFERENCES public.question_bank_tests(id) ON DELETE SET NULL,
  opposition_id TEXT NOT NULL,
  opposition_name TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('facil', 'media', 'dificil')),
  locale TEXT NOT NULL DEFAULT 'es'
    CHECK (locale IN ('es')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'published', 'disabled')),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id TEXT NOT NULL
    CHECK (correct_option_id IN ('A', 'B', 'C', 'D')),
  explanation TEXT NOT NULL DEFAULT '',
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  prompt_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_bank_questions_lookup_idx
  ON public.question_bank_questions (
    opposition_id,
    topic_id,
    locale,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS question_bank_questions_lookup_diff_idx
  ON public.question_bank_questions (
    opposition_id,
    topic_id,
    difficulty,
    locale,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS question_bank_questions_source_idx
  ON public.question_bank_questions (source_bank_test_id);

CREATE TABLE IF NOT EXISTS public.question_bank_question_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.question_bank_questions(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  id_boe TEXT,
  article TEXT,
  reference TEXT,
  unit_type TEXT,
  score DOUBLE PRECISION,
  title TEXT,
  snippet TEXT,
  raw_chunk JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_question_sources_unique UNIQUE (question_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS question_bank_question_sources_question_idx
  ON public.question_bank_question_sources (question_id);

CREATE INDEX IF NOT EXISTS question_bank_question_sources_chunk_idx
  ON public.question_bank_question_sources (chunk_id);

CREATE TABLE IF NOT EXISTS public.question_bank_question_claims (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.question_bank_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quick_test_id UUID REFERENCES public.quick_tests(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_question_claims_user_question_unique UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_bank_question_claims_user_claimed_idx
  ON public.question_bank_question_claims (user_id, claimed_at DESC);

ALTER TABLE public.question_bank_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_question_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_question_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_bank_questions FROM anon, authenticated;
REVOKE ALL ON TABLE public.question_bank_question_sources FROM anon, authenticated;
REVOKE ALL ON TABLE public.question_bank_question_claims FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_question_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_question_claims TO service_role;

DO $$
DECLARE
  v_questions_seq TEXT;
  v_question_sources_seq TEXT;
  v_question_claims_seq TEXT;
BEGIN
  v_questions_seq := pg_get_serial_sequence('public.question_bank_questions', 'id');
  IF v_questions_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_questions_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_questions_seq);
  END IF;

  v_question_sources_seq := pg_get_serial_sequence('public.question_bank_question_sources', 'id');
  IF v_question_sources_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_question_sources_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_question_sources_seq);
  END IF;

  v_question_claims_seq := pg_get_serial_sequence('public.question_bank_question_claims', 'id');
  IF v_question_claims_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_question_claims_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_question_claims_seq);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_question_bank_questions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_question_bank_questions_updated_at ON public.question_bank_questions;
CREATE TRIGGER set_question_bank_questions_updated_at
BEFORE UPDATE ON public.question_bank_questions
FOR EACH ROW
EXECUTE FUNCTION public.set_question_bank_questions_updated_at();

-- Backfill existing batch rows into question-centric table once.
WITH expanded AS (
  SELECT
    t.id AS source_bank_test_id,
    t.opposition_id,
    t.opposition_name,
    t.topic_id,
    t.topic_label,
    t.difficulty,
    t.locale,
    t.status,
    t.model,
    t.prompt_version,
    t.metadata,
    t.validated_at,
    t.created_at,
    t.updated_at,
    q.item,
    q.ord
  FROM public.question_bank_tests t
  JOIN LATERAL (
    SELECT e AS item, ord
    FROM jsonb_array_elements(t.questions) WITH ORDINALITY AS x(e, ord)
  ) q ON true
  WHERE jsonb_typeof(t.questions) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_bank_questions qq
      WHERE qq.source_bank_test_id = t.id
    )
)
INSERT INTO public.question_bank_questions (
  source_bank_test_id,
  opposition_id,
  opposition_name,
  topic_id,
  topic_label,
  difficulty,
  locale,
  status,
  question,
  options,
  correct_option_id,
  explanation,
  citations,
  model,
  prompt_version,
  metadata,
  validated_at,
  created_at,
  updated_at
)
SELECT
  e.source_bank_test_id,
  e.opposition_id,
  e.opposition_name,
  e.topic_id,
  e.topic_label,
  e.difficulty,
  coalesce(nullif(btrim(e.locale), ''), 'es'),
  CASE
    WHEN e.status IN ('draft', 'validated', 'published', 'disabled') THEN e.status
    ELSE 'draft'
  END,
  coalesce(
    nullif(btrim(e.item->>'question'), ''),
    nullif(btrim(e.item->>'enunciado'), ''),
    nullif(btrim(e.item->>'statement'), ''),
    nullif(btrim(e.item->>'prompt'), ''),
    nullif(btrim(e.item->>'text'), ''),
    'Pregunta sin texto'
  ),
  coalesce(
    e.item->'options',
    e.item->'choices',
    e.item->'answers',
    e.item->'alternatives',
    '[]'::jsonb
  ),
  CASE
    WHEN upper(btrim(coalesce(
      e.item->>'correctOptionId',
      e.item->>'correct_option_id',
      e.item->>'correct',
      e.item->>'correctAnswer',
      e.item->>'correct_answer',
      ''
    ))) IN ('A', 'B', 'C', 'D')
      THEN upper(btrim(coalesce(
        e.item->>'correctOptionId',
        e.item->>'correct_option_id',
        e.item->>'correct',
        e.item->>'correctAnswer',
        e.item->>'correct_answer'
      )))
    WHEN public.safe_to_int(coalesce(
      e.item->>'correctOptionIndex',
      e.item->>'correct_index',
      e.item->>'answerIndex',
      e.item->>'correctAnswerIndex'
    )) BETWEEN 0 AND 3
      THEN chr(65 + public.safe_to_int(coalesce(
        e.item->>'correctOptionIndex',
        e.item->>'correct_index',
        e.item->>'answerIndex',
        e.item->>'correctAnswerIndex'
      )))
    WHEN public.safe_to_int(coalesce(
      e.item->>'correctOptionIndex',
      e.item->>'correct_index',
      e.item->>'answerIndex',
      e.item->>'correctAnswerIndex'
    )) BETWEEN 1 AND 4
      THEN chr(64 + public.safe_to_int(coalesce(
        e.item->>'correctOptionIndex',
        e.item->>'correct_index',
        e.item->>'answerIndex',
        e.item->>'correctAnswerIndex'
      )))
    ELSE 'A'
  END,
  coalesce(
    nullif(btrim(e.item->>'explanation'), ''),
    nullif(btrim(e.item->>'explicacion'), ''),
    nullif(btrim(e.item->>'justification'), ''),
    ''
  ),
  coalesce(
    e.item->'citations',
    e.item->'references',
    e.item->'sources',
    '[]'::jsonb
  ),
  e.model,
  e.prompt_version,
  coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('source_ord', e.ord),
  e.validated_at,
  e.created_at,
  e.updated_at
FROM expanded e;

-- Backfill question-level sources from existing citations/chunk table.
INSERT INTO public.question_bank_question_sources (
  question_id,
  chunk_id,
  id_boe,
  article,
  reference,
  unit_type,
  score,
  title,
  snippet,
  raw_chunk,
  created_at
)
SELECT
  qq.id AS question_id,
  coalesce(c.cit->>'chunkId', c.cit->>'chunk_id', c.cit->>'id', s.chunk_id) AS chunk_id,
  coalesce(c.cit->>'idBoe', c.cit->>'id_boe', s.id_boe) AS id_boe,
  coalesce(c.cit->>'article', c.cit->>'articulo', s.article) AS article,
  coalesce(c.cit->>'reference', c.cit->>'referencia', s.reference) AS reference,
  s.unit_type,
  s.score,
  s.title,
  s.snippet,
  coalesce(s.raw_chunk, c.cit, '{}'::jsonb) AS raw_chunk,
  coalesce(s.created_at, qq.created_at)
FROM public.question_bank_questions qq
JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(qq.citations) = 'array' THEN qq.citations
    ELSE '[]'::jsonb
  END
) c(cit) ON true
LEFT JOIN public.question_bank_sources s
  ON s.bank_test_id = qq.source_bank_test_id
  AND s.chunk_id = coalesce(c.cit->>'chunkId', c.cit->>'chunk_id', c.cit->>'id')
WHERE coalesce(c.cit->>'chunkId', c.cit->>'chunk_id', c.cit->>'id', s.chunk_id) IS NOT NULL
ON CONFLICT (question_id, chunk_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_question_bank_questions(
  p_user_id UUID,
  p_opposition_id TEXT,
  p_topic_id TEXT,
  p_question_count INT,
  p_locale TEXT DEFAULT 'es',
  p_include_draft BOOLEAN DEFAULT true
)
RETURNS TABLE(
  bank_question_id BIGINT,
  opposition_name TEXT,
  topic_id TEXT,
  topic_label TEXT,
  difficulty TEXT,
  locale TEXT,
  question TEXT,
  options JSONB,
  correct_option_id TEXT,
  explanation TEXT,
  citations JSONB,
  model TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_target INT;
BEGIN
  v_target := greatest(1, least(100, coalesce(p_question_count, 1)));

  RETURN QUERY
  WITH fresh AS (
    SELECT q.id
    FROM public.question_bank_questions q
    WHERE q.opposition_id = p_opposition_id
      AND q.topic_id = p_topic_id
      AND q.locale = p_locale
      AND (
        q.status IN ('validated', 'published')
        OR (coalesce(p_include_draft, true) AND q.status = 'draft')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_bank_question_claims c
        WHERE c.user_id = p_user_id
          AND c.question_id = q.id
      )
    ORDER BY random()
    FOR UPDATE SKIP LOCKED
    LIMIT v_target
  ),
  fallback AS (
    SELECT q.id
    FROM public.question_bank_questions q
    WHERE q.opposition_id = p_opposition_id
      AND q.topic_id = p_topic_id
      AND q.locale = p_locale
      AND (
        q.status IN ('validated', 'published')
        OR (coalesce(p_include_draft, true) AND q.status = 'draft')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM fresh f
        WHERE f.id = q.id
      )
    ORDER BY random()
    LIMIT greatest(v_target - (SELECT count(*) FROM fresh), 0)
  ),
  picked AS (
    SELECT id FROM fresh
    UNION ALL
    SELECT id FROM fallback
  ),
  _claims AS (
    INSERT INTO public.question_bank_question_claims (question_id, user_id)
    SELECT id, p_user_id
    FROM picked
    ON CONFLICT (user_id, question_id) DO NOTHING
    RETURNING question_id
  )
  SELECT
    q.id AS bank_question_id,
    q.opposition_name,
    q.topic_id,
    q.topic_label,
    q.difficulty,
    q.locale,
    q.question,
    q.options,
    q.correct_option_id,
    q.explanation,
    q.citations,
    q.model
  FROM public.question_bank_questions q
  JOIN picked p ON p.id = q.id
  ORDER BY random();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_question_bank_questions(UUID, TEXT, TEXT, INT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_question_bank_questions(UUID, TEXT, TEXT, INT, TEXT, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_question_bank_questions(UUID, TEXT, TEXT, INT, TEXT, BOOLEAN) TO service_role;
