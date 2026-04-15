ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER;

ALTER TABLE IF EXISTS public.quick_test_attempts
  DROP CONSTRAINT IF EXISTS quick_test_attempts_paused_remaining_seconds_check;

ALTER TABLE IF EXISTS public.quick_test_attempts
  ADD CONSTRAINT quick_test_attempts_paused_remaining_seconds_check
  CHECK (
    paused_remaining_seconds IS NULL
    OR paused_remaining_seconds >= 0
  );
