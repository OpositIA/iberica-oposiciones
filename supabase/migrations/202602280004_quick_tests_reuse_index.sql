-- Speeds up lookup of pre-generated quick tests by user/opposition/question count.

CREATE INDEX IF NOT EXISTS quick_tests_reuse_lookup_idx
  ON public.quick_tests (user_id, opposition_id, question_count, created_at);
