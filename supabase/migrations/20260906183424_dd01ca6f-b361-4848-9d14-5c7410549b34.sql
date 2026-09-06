ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS roster_refresh_due_at timestamptz;
ALTER TABLE public.universities ADD COLUMN IF NOT EXISTS facts_refresh_due_at timestamptz;

-- Stagger each record by its own anniversary so the load spreads across the year.
UPDATE public.programs
   SET roster_refresh_due_at = COALESCE(last_roster_pull_at, created_at) + interval '6 months'
 WHERE roster_refresh_due_at IS NULL;

UPDATE public.universities
   SET facts_refresh_due_at = COALESCE(federal_synced_at, created_at) + interval '1 year'
 WHERE facts_refresh_due_at IS NULL;

CREATE INDEX IF NOT EXISTS programs_roster_refresh_due_idx ON public.programs (roster_refresh_due_at);
CREATE INDEX IF NOT EXISTS universities_facts_refresh_due_idx ON public.universities (facts_refresh_due_at);

CREATE OR REPLACE FUNCTION public.enqueue_due_refreshes(_program_limit integer DEFAULT 300, _school_limit integer DEFAULT 300)
RETURNS TABLE(programs_queued integer, schools_queued integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _programs integer := 0;
  _schools integer := 0;
BEGIN
  WITH due AS (
    SELECT p.id FROM public.programs p
     WHERE p.roster_refresh_due_at IS NOT NULL
       AND p.roster_refresh_due_at <= now()
       AND p.roster_url IS NOT NULL
     ORDER BY p.roster_refresh_due_at
     LIMIT GREATEST(_program_limit, 0)
  ), ins AS (
    INSERT INTO public.ingest_queue (program_id, stage, status, attempts, leased_at)
    SELECT d.id, 'program_scrape', 'pending', 0, NULL FROM due d
    ON CONFLICT (program_id, stage) DO UPDATE
      SET status = 'pending', attempts = 0, leased_at = NULL, updated_at = now()
    RETURNING 1
  ), bump AS (
    UPDATE public.programs p
       SET roster_refresh_due_at = now() + interval '6 months'
     WHERE p.id IN (SELECT id FROM due)
    RETURNING 1
  )
  SELECT count(*)::integer INTO _programs FROM bump;

  WITH due AS (
    SELECT u.id FROM public.universities u
     WHERE u.facts_refresh_due_at IS NOT NULL
       AND u.facts_refresh_due_at <= now()
       AND u.federal_match_status IN ('confirmed', 'manual')
     ORDER BY u.facts_refresh_due_at
     LIMIT GREATEST(_school_limit, 0)
  ), ins AS (
    INSERT INTO public.ingest_queue (university_id, stage, status, attempts, leased_at)
    SELECT d.id, 'federal_data', 'pending', 0, NULL FROM due d
    ON CONFLICT (university_id, stage) DO UPDATE
      SET status = 'pending', attempts = 0, leased_at = NULL, updated_at = now()
    RETURNING 1
  ), bump AS (
    UPDATE public.universities u
       SET facts_refresh_due_at = now() + interval '1 year'
     WHERE u.id IN (SELECT id FROM due)
    RETURNING 1
  )
  SELECT count(*)::integer INTO _schools FROM bump;

  RETURN QUERY SELECT _programs, _schools;
END;
$$;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'power-recruit-refresh-due';
SELECT cron.schedule('power-recruit-refresh-due', '15 7 * * *', $$SELECT public.enqueue_due_refreshes();$$);