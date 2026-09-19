CREATE OR REPLACE FUNCTION public.completion_counts(_years integer[])
RETURNS TABLE(
  sponsored bigint,
  unverified_sponsorship bigint,
  with_roster_page bigint,
  with_staff_page bigint,
  with_current_roster bigint,
  with_coach bigint,
  needs_links bigint,
  needs_roster bigint,
  needs_coach bigint,
  done bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH p AS (
    SELECT pr.id,
           pr.roster_url IS NOT NULL AS has_roster_page,
           pr.coaching_staff_url IS NOT NULL AS has_staff_page,
           EXISTS (
             SELECT 1 FROM public.roster_players rp
              WHERE rp.program_id = pr.id AND rp.season_year = ANY(_years)
           ) AS has_roster,
           (pr.head_coach_name IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.data_field_sources s
              WHERE s.table_name = 'programs'
                AND s.field_name = 'head_coach_name'
                AND s.record_id = pr.id
           )) AS has_coach
      FROM public.programs pr
     WHERE pr.offering_status = 'verified'
  )
  SELECT
    (SELECT count(*) FROM p),
    (SELECT count(*) FROM public.programs WHERE offering_status = 'unverified'),
    count(*) FILTER (WHERE has_roster_page),
    count(*) FILTER (WHERE has_staff_page),
    count(*) FILTER (WHERE has_roster),
    count(*) FILTER (WHERE has_coach),
    count(*) FILTER (WHERE NOT has_roster_page OR NOT has_staff_page),
    count(*) FILTER (WHERE NOT has_roster),
    count(*) FILTER (WHERE NOT has_coach),
    count(*) FILTER (WHERE has_roster_page AND has_staff_page AND has_roster AND has_coach)
  FROM p;
$$;

CREATE OR REPLACE FUNCTION public.collection_queue_counts()
RETURNS TABLE(pending bigint, running bigint, failed bigint, blocked bigint, exhausted bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND (attempts < 3)),
    count(*) FILTER (WHERE status = 'running'),
    count(*) FILTER (WHERE status = 'failed' AND (attempts < 3)),
    count(*) FILTER (WHERE status = 'held' AND (attempts < 3)),
    count(*) FILTER (WHERE coalesce(attempts, 0) >= 3 AND status <> 'running')
  FROM public.ingest_queue
  WHERE stage IN ('url_discovery', 'program_scrape')
    AND status <> 'done';
$$;

CREATE OR REPLACE FUNCTION public.program_gaps(_years integer[], _limit integer DEFAULT 5000)
RETURNS TABLE(
  program_id uuid,
  university_id uuid,
  school_name text,
  sport public.sport,
  needs_links boolean,
  needs_roster boolean,
  needs_coach boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pr.id, pr.university_id, u.name, pr.sport,
         (pr.roster_url IS NULL OR pr.coaching_staff_url IS NULL),
         NOT EXISTS (
           SELECT 1 FROM public.roster_players rp
            WHERE rp.program_id = pr.id AND rp.season_year = ANY(_years)
         ),
         (pr.head_coach_name IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.data_field_sources s
            WHERE s.table_name = 'programs'
              AND s.field_name = 'head_coach_name'
              AND s.record_id = pr.id
         ))
    FROM public.programs pr
    JOIN public.universities u ON u.id = pr.university_id
   WHERE pr.offering_status = 'verified'
     AND (
       pr.roster_url IS NULL OR pr.coaching_staff_url IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.roster_players rp
          WHERE rp.program_id = pr.id AND rp.season_year = ANY(_years)
       )
       OR pr.head_coach_name IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.data_field_sources s
          WHERE s.table_name = 'programs'
            AND s.field_name = 'head_coach_name'
            AND s.record_id = pr.id
       )
     )
   ORDER BY pr.id
   LIMIT GREATEST(_limit, 0);
$$;

REVOKE ALL ON FUNCTION public.completion_counts(integer[]) FROM anon;
REVOKE ALL ON FUNCTION public.collection_queue_counts() FROM anon;
REVOKE ALL ON FUNCTION public.program_gaps(integer[], integer) FROM anon;
CREATE INDEX IF NOT EXISTS roster_players_program_season_idx
  ON public.roster_players (program_id, season_year);
CREATE INDEX IF NOT EXISTS data_field_sources_lookup_idx
  ON public.data_field_sources (table_name, field_name, record_id);