ALTER TABLE public.question_bank_questions
ADD COLUMN IF NOT EXISTS incorrect_reports_count INT NOT NULL DEFAULT 0
  CHECK (incorrect_reports_count >= 0);

CREATE TABLE IF NOT EXISTS public.question_bank_question_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.question_bank_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quick_test_id UUID REFERENCES public.quick_tests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_question_reports_user_question_unique UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_bank_question_reports_question_idx
  ON public.question_bank_question_reports (question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS question_bank_question_reports_user_idx
  ON public.question_bank_question_reports (user_id, created_at DESC);

ALTER TABLE public.question_bank_question_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_bank_question_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_question_reports TO service_role;

DO $$
DECLARE
  v_question_reports_seq TEXT;
BEGIN
  v_question_reports_seq := pg_get_serial_sequence('public.question_bank_question_reports', 'id');
  IF v_question_reports_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_question_reports_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_question_reports_seq);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_question_bank_question_report_threshold()
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_question_bank_question_report_state(
  p_question_ids BIGINT[]
)
RETURNS TABLE (
  question_id BIGINT,
  report_count INT,
  user_reported BOOLEAN,
  is_disabled BOOLEAN,
  report_threshold INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_questions AS (
    SELECT DISTINCT unnest(coalesce(p_question_ids, ARRAY[]::BIGINT[])) AS question_id
  ),
  auth_user_cte AS (
    SELECT auth.uid() AS user_id
  )
  SELECT
    q.id AS question_id,
    q.incorrect_reports_count AS report_count,
    EXISTS (
      SELECT 1
      FROM public.question_bank_question_reports r
      CROSS JOIN auth_user_cte cu
      WHERE r.question_id = q.id
        AND r.user_id = cu.user_id
    ) AS user_reported,
    q.status = 'disabled' AS is_disabled,
    public.get_question_bank_question_report_threshold() AS report_threshold
  FROM public.question_bank_questions q
  JOIN target_questions tq ON tq.question_id = q.id;
$$;

CREATE OR REPLACE FUNCTION public.report_question_bank_question(
  p_question_id BIGINT,
  p_quick_test_id UUID DEFAULT NULL
)
RETURNS TABLE (
  question_id BIGINT,
  report_count INT,
  user_reported BOOLEAN,
  is_disabled BOOLEAN,
  report_threshold INT,
  inserted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_threshold INT := public.get_question_bank_question_report_threshold();
  v_report_count INT := 0;
  v_status TEXT := NULL;
  v_inserted BOOLEAN := FALSE;
  v_inserted_rows INT := 0;
  v_user_reported BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT q.incorrect_reports_count, q.status
  INTO v_report_count, v_status
  FROM public.question_bank_questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  IF v_status = 'disabled' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.question_bank_question_reports r
      WHERE r.question_id = p_question_id
        AND r.user_id = v_user_id
    )
    INTO v_user_reported;

    RETURN QUERY
    SELECT
      p_question_id,
      v_report_count,
      v_user_reported,
      TRUE,
      v_threshold,
      FALSE;
    RETURN;
  END IF;

  INSERT INTO public.question_bank_question_reports (
    question_id,
    user_id,
    quick_test_id
  )
  VALUES (
    p_question_id,
    v_user_id,
    p_quick_test_id
  )
  ON CONFLICT (user_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
  v_inserted := v_inserted_rows > 0;
  v_user_reported := v_inserted OR EXISTS (
    SELECT 1
    FROM public.question_bank_question_reports r
    WHERE r.question_id = p_question_id
      AND r.user_id = v_user_id
  );

  IF v_inserted THEN
    UPDATE public.question_bank_questions q
    SET
      incorrect_reports_count = q.incorrect_reports_count + 1,
      status = CASE
        WHEN q.incorrect_reports_count + 1 >= v_threshold THEN 'disabled'
        ELSE q.status
      END
    WHERE q.id = p_question_id
    RETURNING q.incorrect_reports_count, q.status
    INTO v_report_count, v_status;
  ELSE
    SELECT q.incorrect_reports_count, q.status
    INTO v_report_count, v_status
    FROM public.question_bank_questions q
    WHERE q.id = p_question_id;
  END IF;

  RETURN QUERY
  SELECT
    p_question_id,
    v_report_count,
    v_user_reported,
    v_status = 'disabled',
    v_threshold,
    v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.get_question_bank_question_report_threshold() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_question_bank_question_report_threshold() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_bank_question_report_threshold() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_question_bank_question_report_state(BIGINT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_question_bank_question_report_state(BIGINT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_bank_question_report_state(BIGINT[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.report_question_bank_question(BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_question_bank_question(BIGINT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_question_bank_question(BIGINT, UUID) TO authenticated, service_role;
