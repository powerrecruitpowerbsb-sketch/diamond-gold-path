-- Measurables: who confirmed a number, and when
ALTER TABLE public.athlete_metrics
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Only organization staff (or Curve staff / server jobs) can mark a number verified.
-- Anything a player or parent enters is self-reported; staff entries are verified.
CREATE OR REPLACE FUNCTION public.guard_metric_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff boolean := auth.uid() IS NULL OR public.is_superadmin() OR public.can_access_athlete(NEW.org_athlete_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF staff AND auth.uid() IS NOT NULL THEN
      NEW.verified := true;
      NEW.verified_by := auth.uid();
      NEW.verified_at := now();
    ELSIF NOT staff THEN
      NEW.verified := false;
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
    END IF;
  ELSE
    IF NOT staff THEN
      NEW.verified := OLD.verified;
      NEW.verified_by := OLD.verified_by;
      NEW.verified_at := OLD.verified_at;
      -- a family edit to the number itself makes it self-reported again
      IF NEW.value IS DISTINCT FROM OLD.value THEN
        NEW.verified := false; NEW.verified_by := NULL; NEW.verified_at := NULL;
      END IF;
    ELSIF NEW.verified AND NOT COALESCE(OLD.verified, false) THEN
      NEW.verified_by := COALESCE(NEW.verified_by, auth.uid());
      NEW.verified_at := COALESCE(NEW.verified_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_metrics_guard_verification ON public.athlete_metrics;
CREATE TRIGGER athlete_metrics_guard_verification
BEFORE INSERT OR UPDATE ON public.athlete_metrics
FOR EACH ROW EXECUTE FUNCTION public.guard_metric_verification();

-- Uploaded video clips
CREATE TABLE public.athlete_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  title text,
  category text NOT NULL DEFAULT 'game',
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX athlete_videos_athlete_idx ON public.athlete_videos (org_athlete_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_videos TO authenticated;
GRANT ALL ON public.athlete_videos TO service_role;

ALTER TABLE public.athlete_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athlete videos staff and family"
ON public.athlete_videos FOR ALL TO authenticated
USING (public.can_access_athlete(org_athlete_id) OR public.is_linked_athlete(org_athlete_id) OR (SELECT public.is_superadmin()))
WITH CHECK (public.can_access_athlete(org_athlete_id) OR public.is_linked_athlete(org_athlete_id) OR (SELECT public.is_superadmin()));

CREATE TRIGGER athlete_videos_touch BEFORE UPDATE ON public.athlete_videos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage: same folder-per-athlete rule as photos
CREATE POLICY "athlete videos readable by staff and family" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'athlete-videos' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "athlete videos writable by staff and family" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'athlete-videos' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "athlete videos removable by staff and family" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'athlete-videos' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));

-- Scout card now carries uploaded clips (paths only; the server signs them)
CREATE OR REPLACE FUNCTION public.athlete_scout_card(_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'athlete', jsonb_build_object(
      'name', a.name, 'sport', a.sport, 'grad_year', a.grad_year,
      'primary_position', a.primary_position, 'secondary_position', a.secondary_position,
      'bats', a.bats, 'throws', a.throws, 'height_inches', a.height_inches, 'weight_lbs', a.weight_lbs,
      'high_school', a.high_school, 'club_team', a.club_team, 'home_city', a.home_city, 'home_state', a.home_state,
      'gpa', a.gpa, 'sat_score', a.sat_score, 'act_score', a.act_score, 'eligibility_id', a.eligibility_id,
      'twitter_handle', a.twitter_handle, 'instagram_handle', a.instagram_handle,
      'video_links', a.video_links, 'photo_path', a.photo_path,
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
        SELECT DISTINCT ON (metric_key) metric_key, value, unit, recorded_on, source, verified
        FROM public.athlete_metrics WHERE org_athlete_id = a.id
        ORDER BY metric_key, recorded_on DESC NULLS LAST, created_at DESC
      ) m
    ), '[]'::jsonb),
    'videos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'storage_path', v.storage_path, 'title', v.title, 'category', v.category) ORDER BY v.created_at DESC)
      FROM public.athlete_videos v WHERE v.org_athlete_id = a.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(e ORDER BY e.start_date ASC)
      FROM (
        SELECT se.name, se.event_type, se.start_date, se.end_date, se.venue, se.city, se.state
        FROM public.schedule_events se
        WHERE (se.org_athlete_id = a.id
               OR se.team_id IN (SELECT ta.team_id FROM public.team_athletes ta WHERE ta.org_athlete_id = a.id))
          AND se.start_date >= (now() - interval '1 day')::date
        ORDER BY se.start_date ASC LIMIT 30
      ) e
    ), '[]'::jsonb)
  )
  FROM public.org_athletes a
  WHERE a.share_slug = _slug AND a.share_enabled
  LIMIT 1
$function$;