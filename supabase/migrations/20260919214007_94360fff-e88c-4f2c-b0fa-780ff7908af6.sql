ALTER TABLE public.org_athletes
  ADD COLUMN IF NOT EXISTS athlete_email text,
  ADD COLUMN IF NOT EXISTS athlete_phone text,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS home_state text,
  ADD COLUMN IF NOT EXISTS high_school text,
  ADD COLUMN IF NOT EXISTS club_team text,
  ADD COLUMN IF NOT EXISTS height_inches integer,
  ADD COLUMN IF NOT EXISTS weight_lbs integer,
  ADD COLUMN IF NOT EXISTS secondary_position text,
  ADD COLUMN IF NOT EXISTS gpa numeric(4,2),
  ADD COLUMN IF NOT EXISTS sat_score integer,
  ADD COLUMN IF NOT EXISTS act_score integer,
  ADD COLUMN IF NOT EXISTS eligibility_id text,
  ADD COLUMN IF NOT EXISTS twitter_handle text,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS video_links text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.athlete_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  value numeric NOT NULL,
  unit text,
  recorded_on date,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS athlete_metrics_athlete_idx
  ON public.athlete_metrics (org_athlete_id, metric_key, recorded_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_metrics TO authenticated;
GRANT ALL ON public.athlete_metrics TO service_role;
ALTER TABLE public.athlete_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athlete_metrics family or org" ON public.athlete_metrics
  FOR ALL TO authenticated
  USING (public.can_access_athlete(org_athlete_id) OR public.is_superadmin())
  WITH CHECK (public.can_access_athlete(org_athlete_id) OR public.is_superadmin());

CREATE TRIGGER athlete_metrics_touch BEFORE UPDATE ON public.athlete_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  org_athlete_id uuid REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'tournament',
  start_date date NOT NULL,
  end_date date,
  venue text,
  city text,
  state text,
  notes text,
  link_url text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_events_team_idx ON public.schedule_events (team_id, start_date);
CREATE INDEX IF NOT EXISTS schedule_events_athlete_idx ON public.schedule_events (org_athlete_id, start_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_events TO authenticated;
GRANT ALL ON public.schedule_events TO service_role;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_events athlete events" ON public.schedule_events
  FOR ALL TO authenticated
  USING (
    public.is_superadmin()
    OR (org_athlete_id IS NOT NULL AND public.can_access_athlete(org_athlete_id))
    OR (org_athlete_id IS NULL AND organization_id IS NOT NULL AND (
      (public.is_org_manager() AND organization_id = public.current_org_id())
      OR EXISTS (
        SELECT 1 FROM public.team_athletes ta
        WHERE ta.team_id = schedule_events.team_id
          AND public.can_access_athlete(ta.org_athlete_id)
      )
    ))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (org_athlete_id IS NOT NULL AND public.can_access_athlete(org_athlete_id))
    OR (org_athlete_id IS NULL AND organization_id IS NOT NULL
        AND public.is_org_manager() AND organization_id = public.current_org_id())
  );

CREATE TRIGGER schedule_events_touch BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();