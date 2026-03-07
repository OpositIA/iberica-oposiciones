-- Compatibility migration for projects where quick_tests / quick_test_attempts
-- already existed before the new quick-test session schema.

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS opposition_id TEXT;

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS opposition_name TEXT;

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS question_count INT;

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS selected_topics JSONB;

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS questions JSONB;

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.quick_tests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.quick_tests
SET
  opposition_name = COALESCE(opposition_name, 'Oposicion'),
  question_count = COALESCE(question_count, 1),
  selected_topics = COALESCE(selected_topics, '[]'::jsonb),
  questions = COALESCE(questions, '[]'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE
  opposition_name IS NULL
  OR question_count IS NULL
  OR selected_topics IS NULL
  OR questions IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN opposition_name SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN question_count SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN selected_topics SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN questions SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.quick_tests
  ALTER COLUMN selected_topics SET DEFAULT '[]'::jsonb;

ALTER TABLE public.quick_tests
  ALTER COLUMN questions SET DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quick_tests_question_count_check'
      AND conrelid = 'public.quick_tests'::regclass
  ) THEN
    ALTER TABLE public.quick_tests
      ADD CONSTRAINT quick_tests_question_count_check
      CHECK (question_count BETWEEN 1 AND 100);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS selected_answers JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS active_question_id TEXT;

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.quick_test_attempts
SET
  selected_answers = COALESCE(selected_answers, '{}'::jsonb),
  started_at = COALESCE(started_at, now()),
  last_interaction_at = COALESCE(last_interaction_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE
  selected_answers IS NULL
  OR started_at IS NULL
  OR last_interaction_at IS NULL
  OR updated_at IS NULL;

ALTER TABLE public.quick_test_attempts
  ALTER COLUMN selected_answers SET NOT NULL;

ALTER TABLE public.quick_test_attempts
  ALTER COLUMN started_at SET NOT NULL;

ALTER TABLE public.quick_test_attempts
  ALTER COLUMN last_interaction_at SET NOT NULL;

ALTER TABLE public.quick_test_attempts
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.quick_test_attempts
  ALTER COLUMN selected_answers SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS quick_tests_user_created_idx
  ON public.quick_tests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quick_test_attempts_user_test_idx
  ON public.quick_test_attempts (user_id, test_id);

CREATE INDEX IF NOT EXISTS quick_test_attempts_test_idx
  ON public.quick_test_attempts (test_id);

DROP TRIGGER IF EXISTS set_quick_tests_updated_at ON public.quick_tests;
CREATE TRIGGER set_quick_tests_updated_at
BEFORE UPDATE ON public.quick_tests
FOR EACH ROW EXECUTE PROCEDURE public.set_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_quick_test_attempts_updated_at ON public.quick_test_attempts;
CREATE TRIGGER set_quick_test_attempts_updated_at
BEFORE UPDATE ON public.quick_test_attempts
FOR EACH ROW EXECUTE PROCEDURE public.set_timestamp_updated_at();
