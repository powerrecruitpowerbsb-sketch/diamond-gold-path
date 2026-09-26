ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS packet_token text UNIQUE, ADD COLUMN IF NOT EXISTS packet_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.team_packet(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'team', t.name, 'ageGroup', t.age_group, 'org', o.name, 'season', s.name,
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jersey', ta.jersey_number, 'name', a.name, 'gradYear', a.grad_year,
        'position', a.primary_position, 'bats', a.bats, 'throws', a.throws,
        'height', a.height_inches, 'weight', a.weight_lbs,
        'slug', CASE WHEN a.share_enabled THEN a.share_slug END,
        'metrics', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', m.metric_key, 'value', m.value) ORDER BY m.metric_key)
           FROM (SELECT DISTINCT ON (metric_key) metric_key, value FROM athlete_metrics
                 WHERE org_athlete_id = a.id AND verified ORDER BY metric_key, recorded_on DESC NULLS LAST, created_at DESC) m), '[]'::jsonb)
      ) ORDER BY NULLIF(regexp_replace(COALESCE(ta.jersey_number,''),'\D','','g'),'')::int NULLS LAST, a.name)
      FROM team_athletes ta JOIN org_athletes a ON a.id = ta.org_athlete_id
      WHERE ta.team_id = t.id AND COALESCE(a.status::text,'active') = 'active'), '[]'::jsonb)
  )
  FROM teams t JOIN organizations o ON o.id = t.organization_id LEFT JOIN seasons s ON s.id = t.season_id
  WHERE t.packet_token = _token AND t.packet_enabled AND length(_token) >= 16
$$;
GRANT EXECUTE ON FUNCTION public.team_packet(text) TO anon, authenticated;