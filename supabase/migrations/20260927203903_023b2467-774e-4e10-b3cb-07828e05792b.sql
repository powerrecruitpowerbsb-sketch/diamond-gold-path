CREATE OR REPLACE FUNCTION public.enqueue_due_refreshes(_program_limit integer DEFAULT 300, _school_limit integer DEFAULT 300)
 RETURNS TABLE(programs_queued integer, schools_queued integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _programs integer := 0;
  _schools integer := 0;
BEGIN
  WITH due AS (
    SELECT p.id, p.university_id FROM public.programs p
     WHERE p.roster_refresh_due_at IS NOT NULL
       AND p.roster_refresh_due_at <= now()
       AND p.roster_url IS NOT NULL
       AND p.offering_status <> 'not_offered'
     ORDER BY p.roster_refresh_due_at
     LIMIT GREATEST(_program_limit, 0)
  ), ins AS (
    INSERT INTO public.ingest_queue (program_id, university_id, stage, status, attempts, leased_at)
    SELECT d.id, d.university_id, 'program_scrape', 'pending', 0, NULL FROM due d
    ON CONFLICT (program_id, stage) WHERE program_id IS NOT NULL DO UPDATE
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
    ON CONFLICT (university_id, stage) WHERE program_id IS NULL DO UPDATE
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
$function$;