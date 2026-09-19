ALTER TABLE public.org_athletes
  ADD COLUMN IF NOT EXISTS share_slug text,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_contact boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS org_athletes_share_slug_key
  ON public.org_athletes (share_slug) WHERE share_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.athlete_scout_card(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'athlete', jsonb_build_object(
      'name', a.name,
      'sport', a.sport,
      'grad_year', a.grad_year,
      'primary_position', a.primary_position,
      'secondary_position', a.secondary_position,
      'bats', a.bats,
      'throws', a.throws,
      'height_inches', a.height_inches,
      'weight_lbs', a.weight_lbs,
      'high_school', a.high_school,
      'club_team', a.club_team,
      'home_city', a.home_city,
      'home_state', a.home_state,
      'gpa', a.gpa,
      'sat_score', a.sat_score,
      'act_score', a.act_score,
      'eligibility_id', a.eligibility_id,
      'twitter_handle', a.twitter_handle,
      'instagram_handle', a.instagram_handle,
      'video_links', a.video_links,
      'athlete_email', CASE WHEN a.share_contact THEN a.athlete_email END,
      'athlete_phone', CASE WHEN a.share_contact THEN a.athlete_phone END,
      'parent_name', CASE WHEN a.share_contact THEN a.parent_name END,
      'parent_email', CASE WHEN a.share_contact THEN a.parent_email END,
      'parent_phone', CASE WHEN a.share_contact THEN a.parent_phone END
    ),
    'organization', (
      SELECT jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'primary_color', o.brand_primary_color, 'accent_color', o.brand_accent_color)
      FROM public.organizations o WHERE o.id = a.organization_id
    ),
    'metrics', COALESCE((
      SELECT jsonb_agg(m ORDER BY m.recorded_on DESC NULLS LAST)
      FROM (
        SELECT DISTINCT ON (metric_key)
          metric_key, value, unit, recorded_on, source, verified
        FROM public.athlete_metrics
        WHERE org_athlete_id = a.id
        ORDER BY metric_key, recorded_on DESC NULLS LAST, created_at DESC
      ) m
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(e ORDER BY e.start_date ASC)
      FROM (
        SELECT se.name, se.event_type, se.start_date, se.end_date, se.venue, se.city, se.state
        FROM public.schedule_events se
        WHERE (se.org_athlete_id = a.id
               OR se.team_id IN (SELECT ta.team_id FROM public.team_athletes ta WHERE ta.org_athlete_id = a.id))
          AND se.start_date >= (now() - interval '1 day')::date
        ORDER BY se.start_date ASC
        LIMIT 30
      ) e
    ), '[]'::jsonb)
  )
  FROM public.org_athletes a
  WHERE a.share_slug = _slug AND a.share_enabled
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.athlete_scout_card(text) TO anon, authenticated, service_role;