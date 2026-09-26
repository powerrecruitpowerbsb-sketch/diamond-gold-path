ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS wall_token text UNIQUE, ADD COLUMN IF NOT EXISTS wall_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.wall_of_fame(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'org', o.name, 'logoUrl', o.logo_url, 'primary', o.brand_primary_color, 'accent', o.brand_accent_color,
    'commits', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', a.name, 'gradYear', a.grad_year, 'position', a.primary_position, 'sport', a.sport,
        'slug', CASE WHEN a.share_enabled THEN a.share_slug END,
        'hasPhoto', a.share_enabled AND a.photo_path IS NOT NULL,
        'school', u.name, 'division', p.division, 'conference', p.conference,
        'website', p.athletic_website
      ) ORDER BY a.grad_year NULLS LAST, u.name)
      FROM athlete_saved_schools s
      JOIN org_athletes a ON a.id = s.org_athlete_id
      JOIN programs p ON p.id = s.program_id
      JOIN universities u ON u.id = p.university_id
      WHERE a.organization_id = o.id AND s.status = 'committed'), '[]'::jsonb)
  )
  FROM organizations o
  WHERE o.wall_token = _token AND o.wall_enabled AND length(_token) >= 16
$$;
GRANT EXECUTE ON FUNCTION public.wall_of_fame(text) TO anon, authenticated;