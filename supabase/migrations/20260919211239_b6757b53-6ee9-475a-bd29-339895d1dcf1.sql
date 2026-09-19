ALTER TABLE public.athlete_saved_schools
  ADD COLUMN IF NOT EXISTS activity_chips text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS activity_notes jsonb NOT NULL DEFAULT '{}'::jsonb;