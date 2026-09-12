-- provenance for extracted roster rows
ALTER TABLE public.roster_players
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_domain text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid,
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.roster_players
  DROP CONSTRAINT IF EXISTS roster_players_provenance_check;
ALTER TABLE public.roster_players
  ADD CONSTRAINT roster_players_provenance_check
  CHECK (provenance IN ('traced', 'backfilled', 'unknown'));

CREATE INDEX IF NOT EXISTS roster_players_source_domain_idx
  ON public.roster_players (source_domain);

-- provenance for the coach values we keep on the program
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS coach_source_url text,
  ADD COLUMN IF NOT EXISTS coach_source_domain text,
  ADD COLUMN IF NOT EXISTS coach_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_ingest_run_id uuid;

-- refused writes, held for review
CREATE TABLE IF NOT EXISTS public.roster_write_refusals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source_url text NOT NULL,
  source_domain text,
  holder_university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  holder_detail text,
  reason text NOT NULL,
  rows_refused integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.roster_write_refusals TO authenticated;
GRANT ALL ON public.roster_write_refusals TO service_role;

ALTER TABLE public.roster_write_refusals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins read refused roster writes" ON public.roster_write_refusals;
CREATE POLICY "Superadmins read refused roster writes"
  ON public.roster_write_refusals FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP TRIGGER IF EXISTS roster_write_refusals_touch ON public.roster_write_refusals;
CREATE TRIGGER roster_write_refusals_touch
  BEFORE UPDATE ON public.roster_write_refusals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- backfill: only where the program still holds a roster address
UPDATE public.roster_players rp
   SET source_url = p.roster_url,
       source_domain = lower(regexp_replace(split_part(regexp_replace(p.roster_url, '^https?://', ''), '/', 1), '^www\.', '')),
       provenance = 'backfilled'
  FROM public.programs p
 WHERE p.id = rp.program_id
   AND rp.source_url IS NULL
   AND p.roster_url IS NOT NULL
   AND p.roster_url <> '';