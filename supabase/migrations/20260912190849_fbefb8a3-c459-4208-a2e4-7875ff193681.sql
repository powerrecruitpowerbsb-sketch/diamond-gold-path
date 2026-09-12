ALTER TABLE public.majors
  ADD COLUMN IF NOT EXISTS cip_code text,
  ADD COLUMN IF NOT EXISTS cip_family text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy_field_group';

CREATE UNIQUE INDEX IF NOT EXISTS majors_cip_code_key
  ON public.majors (cip_code) WHERE cip_code IS NOT NULL;

ALTER TABLE public.university_majors
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'federal_field_group',
  ADD COLUMN IF NOT EXISTS award_levels text,
  ADD COLUMN IF NOT EXISTS completions integer,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS sat_reading_25 integer,
  ADD COLUMN IF NOT EXISTS sat_reading_75 integer,
  ADD COLUMN IF NOT EXISTS sat_math_25 integer,
  ADD COLUMN IF NOT EXISTS sat_math_75 integer,
  ADD COLUMN IF NOT EXISTS sat_total_25 integer,
  ADD COLUMN IF NOT EXISTS sat_total_75 integer,
  ADD COLUMN IF NOT EXISTS act_25 integer,
  ADD COLUMN IF NOT EXISTS act_75 integer,
  ADD COLUMN IF NOT EXISTS sat_test_takers integer,
  ADD COLUMN IF NOT EXISTS act_test_takers integer,
  ADD COLUMN IF NOT EXISTS test_scores_source_url text,
  ADD COLUMN IF NOT EXISTS test_scores_synced_at timestamptz;