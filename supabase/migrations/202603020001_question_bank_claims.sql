-- Question bank for pre-generated tests + atomic claim per user.

CREATE TABLE IF NOT EXISTS public.question_bank_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opposition_id TEXT NOT NULL,
  opposition_name TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('facil', 'media', 'dificil')),
  locale TEXT NOT NULL DEFAULT 'es'
    CHECK (locale IN ('es')),
  question_count INT NOT NULL
    CHECK (question_count BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'published', 'disabled')),
  model TEXT,
  prompt_version TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_bank_tests_lookup_idx
  ON public.question_bank_tests (
    opposition_id,
    topic_id,
    difficulty,
    locale,
    question_count,
    status,
    created_at DESC
  );

CREATE TABLE IF NOT EXISTS public.question_bank_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank_test_id UUID NOT NULL REFERENCES public.question_bank_tests(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  id_boe TEXT,
  article TEXT,
  reference TEXT,
  unit_type TEXT,
  score DOUBLE PRECISION,
  title TEXT,
  snippet TEXT,
  raw_chunk JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_bank_sources_bank_test_id_idx
  ON public.question_bank_sources (bank_test_id);

CREATE INDEX IF NOT EXISTS question_bank_sources_chunk_id_idx
  ON public.question_bank_sources (chunk_id);

CREATE TABLE IF NOT EXISTS public.question_bank_claims (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank_test_id UUID NOT NULL REFERENCES public.question_bank_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quick_test_id UUID REFERENCES public.quick_tests(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_claims_user_bank_unique UNIQUE (user_id, bank_test_id)
);

CREATE INDEX IF NOT EXISTS question_bank_claims_user_claimed_idx
  ON public.question_bank_claims (user_id, claimed_at DESC);

ALTER TABLE public.question_bank_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_claims ENABLE ROW LEVEL SECURITY;

-- Keep table access restricted to service role.
REVOKE ALL ON TABLE public.question_bank_tests FROM anon, authenticated;
REVOKE ALL ON TABLE public.question_bank_sources FROM anon, authenticated;
REVOKE ALL ON TABLE public.question_bank_claims FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_tests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_claims TO service_role;

DO $$
DECLARE
  v_sources_seq TEXT;
  v_claims_seq TEXT;
BEGIN
  v_sources_seq := pg_get_serial_sequence('public.question_bank_sources', 'id');
  IF v_sources_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_sources_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_sources_seq);
  END IF;

  v_claims_seq := pg_get_serial_sequence('public.question_bank_claims', 'id');
  IF v_claims_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_claims_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_claims_seq);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_question_bank_tests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_question_bank_tests_updated_at ON public.question_bank_tests;
CREATE TRIGGER set_question_bank_tests_updated_at
BEFORE UPDATE ON public.question_bank_tests
FOR EACH ROW
EXECUTE FUNCTION public.set_question_bank_tests_updated_at();

CREATE OR REPLACE FUNCTION public.claim_question_bank_test(
  p_user_id UUID,
  p_opposition_id TEXT,
  p_topic_id TEXT,
  p_question_count INT,
  p_difficulty TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT 'es'
)
RETURNS TABLE(
  bank_test_id UUID,
  opposition_name TEXT,
  topic_label TEXT,
  difficulty TEXT,
  locale TEXT,
  question_count INT,
  questions JSONB,
  model TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_bank_id UUID;
BEGIN
  WITH candidate AS (
    SELECT t.id
    FROM public.question_bank_tests t
    WHERE t.status = 'validated'
      AND t.opposition_id = p_opposition_id
      AND t.topic_id = p_topic_id
      AND t.locale = p_locale
      AND t.question_count = p_question_count
      AND (p_difficulty IS NULL OR t.difficulty = p_difficulty)
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_bank_claims c
        WHERE c.user_id = p_user_id
          AND c.bank_test_id = t.id
      )
    ORDER BY random()
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  SELECT id INTO v_bank_id
  FROM candidate;

  IF v_bank_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.question_bank_claims (bank_test_id, user_id)
  VALUES (v_bank_id, p_user_id)
  ON CONFLICT (user_id, bank_test_id) DO NOTHING;

  RETURN QUERY
  SELECT
    t.id AS bank_test_id,
    t.opposition_name,
    t.topic_label,
    t.difficulty,
    t.locale,
    t.question_count,
    t.questions,
    t.model
  FROM public.question_bank_tests t
  WHERE t.id = v_bank_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_question_bank_test(UUID, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_question_bank_test(UUID, TEXT, TEXT, INT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_question_bank_test(UUID, TEXT, TEXT, INT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_prompt_templates'
  ) THEN
    INSERT INTO public.ai_prompt_templates (
      prompt_key,
      version,
      locale,
      system_prompt,
      user_prompt_template,
      is_active,
      metadata
    )
    SELECT
      'bank_generate_es',
      'v1',
      'es',
      'TODO: define system prompt',
      'TODO: define user prompt template',
      true,
      '{}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ai_prompt_templates t
      WHERE t.prompt_key = 'bank_generate_es'
        AND t.version = 'v1'
        AND t.locale = 'es'
    );

    INSERT INTO public.ai_prompt_templates (
      prompt_key,
      version,
      locale,
      system_prompt,
      user_prompt_template,
      is_active,
      metadata
    )
    SELECT
      'bank_validate_es',
      'v1',
      'es',
      'TODO: define system prompt',
      'TODO: define user prompt template',
      true,
      '{}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.ai_prompt_templates t
      WHERE t.prompt_key = 'bank_validate_es'
        AND t.version = 'v1'
        AND t.locale = 'es'
    );
  END IF;
END $$;
