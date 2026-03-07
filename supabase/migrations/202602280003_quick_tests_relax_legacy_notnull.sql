-- Relax legacy NOT NULL columns in quick-test tables so the new payload
-- (quick session + attempt state) can be inserted/upserted safely.

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'quick_tests'
      AND c.is_nullable = 'NO'
      AND c.column_name NOT IN (
        'id',
        'user_id',
        'opposition_name',
        'question_count',
        'selected_topics',
        'questions',
        'created_at',
        'updated_at'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.quick_tests ALTER COLUMN %I DROP NOT NULL',
      col.column_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'quick_test_attempts'
      AND c.is_nullable = 'NO'
      AND c.column_name NOT IN (
        'id',
        'test_id',
        'user_id',
        'selected_answers',
        'started_at',
        'last_interaction_at',
        'updated_at'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.quick_test_attempts ALTER COLUMN %I DROP NOT NULL',
      col.column_name
    );
  END LOOP;
END $$;
