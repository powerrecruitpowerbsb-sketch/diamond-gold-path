DELETE FROM public.roster_players rp
 USING public.roster_players keep
 WHERE rp.program_id = keep.program_id
   AND rp.season_year IS NOT DISTINCT FROM keep.season_year
   AND lower(btrim(rp.name)) = lower(btrim(keep.name))
   AND rp.id > keep.id;

CREATE UNIQUE INDEX IF NOT EXISTS roster_players_unique_per_season
  ON public.roster_players (program_id, season_year, lower(btrim(name)))
  WHERE season_year IS NOT NULL;

CREATE TABLE public.rejected_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  field_name text NOT NULL,
  normalized_value text NOT NULL,
  reason text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rejected_values_unique
  ON public.rejected_values (table_name, record_id, field_name, normalized_value);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rejected_values TO authenticated;
GRANT ALL ON public.rejected_values TO service_role;

ALTER TABLE public.rejected_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage rejected values"
  ON public.rejected_values FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TABLE public.accuracy_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  stored_value text,
  fresh_value text,
  verdict text NOT NULL,
  detail text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accuracy_checks_checked_at_idx ON public.accuracy_checks (checked_at DESC);

GRANT SELECT ON public.accuracy_checks TO authenticated;
GRANT ALL ON public.accuracy_checks TO service_role;

ALTER TABLE public.accuracy_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins read accuracy checks"
  ON public.accuracy_checks FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.reclaim_stale_leases(_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _freed integer := 0;
BEGIN
  WITH stale AS (
    UPDATE public.ingest_queue
       SET status = 'pending', leased_at = NULL, updated_at = now()
     WHERE status = 'running'
       AND (leased_at IS NULL OR leased_at < now() - make_interval(mins => GREATEST(_minutes, 1)))
    RETURNING 1
  )
  SELECT count(*)::integer INTO _freed FROM stale;
  RETURN _freed;
END;
$$;