ALTER TABLE public.pending_data_changes
  ADD COLUMN IF NOT EXISTS original_value jsonb,
  ADD COLUMN IF NOT EXISTS review_note text;