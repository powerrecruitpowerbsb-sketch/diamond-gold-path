-- 5A: hosts whose own firewall blocks automated reads
CREATE TABLE IF NOT EXISTS public.host_protection (
  host text PRIMARY KEY,
  protection_kind text NOT NULL,
  evidence text,
  detections integer NOT NULL DEFAULT 1,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  last_probe_at timestamptz,
  probe_status text,
  lifted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.host_protection TO authenticated;
GRANT ALL ON public.host_protection TO service_role;
ALTER TABLE public.host_protection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read host protection" ON public.host_protection
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TRIGGER host_protection_touch BEFORE UPDATE ON public.host_protection
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5C: a sweep that can stop and carry on from where it left off
CREATE TABLE IF NOT EXISTS public.sweep_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL UNIQUE,
  label text,
  status text NOT NULL DEFAULT 'planned',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_host text,
  last_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sweep_runs TO authenticated;
GRANT ALL ON public.sweep_runs TO service_role;
ALTER TABLE public.sweep_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read sweep runs" ON public.sweep_runs
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TRIGGER sweep_runs_touch BEFORE UPDATE ON public.sweep_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sweep_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL,
  host text NOT NULL,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  field text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  outcome text,
  detail text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_key, program_id, field)
);

CREATE INDEX IF NOT EXISTS sweep_targets_pending_idx ON public.sweep_targets (run_key, status, host);

GRANT SELECT ON public.sweep_targets TO authenticated;
GRANT ALL ON public.sweep_targets TO service_role;
ALTER TABLE public.sweep_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read sweep targets" ON public.sweep_targets
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TRIGGER sweep_targets_touch BEFORE UPDATE ON public.sweep_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5E: one honest state per stored link
CREATE OR REPLACE VIEW public.link_verification_state
WITH (security_invoker = on) AS
WITH links AS (
  SELECT id AS program_id, university_id, sport::text AS sport,
         'athletic_website'::text AS field, athletic_website AS url
    FROM public.programs WHERE COALESCE(athletic_website, '') <> ''
  UNION ALL
  SELECT id, university_id, sport::text, 'roster_url', roster_url
    FROM public.programs WHERE COALESCE(roster_url, '') <> ''
  UNION ALL
  SELECT id, university_id, sport::text, 'coaching_staff_url', coaching_staff_url
    FROM public.programs WHERE COALESCE(coaching_staff_url, '') <> ''
),
keyed AS (
  SELECT l.*, public.link_key(l.url) AS norm_key, public.link_host_only(l.url) AS host
    FROM links l
),
collisions AS (
  SELECT norm_key FROM keyed
   WHERE norm_key IS NOT NULL AND NOT public.is_platform_host(host)
   GROUP BY norm_key
  HAVING count(DISTINCT university_id) > 1
)
SELECT k.program_id,
       k.university_id,
       k.sport,
       k.field,
       k.url,
       k.host,
       lh.link_status,
       lh.last_verified_ok_at,
       lh.last_failure_category,
       (hp.host IS NOT NULL AND hp.lifted_at IS NULL) AS host_protected,
       (c.norm_key IS NOT NULL) AS conflicted,
       CASE
         WHEN c.norm_key IS NOT NULL THEN 'conflicted'
         WHEN lh.last_verified_ok_at IS NOT NULL AND lh.link_status = 'verified' THEN 'verified'
         ELSE 'unverified'
       END AS verification_state,
       CASE
         WHEN c.norm_key IS NOT NULL THEN 'the same page is attached to another school — ownership not settled'
         WHEN lh.last_verified_ok_at IS NOT NULL AND lh.link_status = 'verified'
           THEN 'read and confirmed on ' || to_char(lh.last_verified_ok_at, 'YYYY-MM-DD')
         WHEN hp.host IS NOT NULL AND hp.lifted_at IS NULL
           THEN 'never read — this site blocks automated reads'
         WHEN lh.id IS NULL THEN 'never read'
         ELSE 'the last read did not confirm this page'
       END AS state_detail
  FROM keyed k
  LEFT JOIN public.link_health lh ON lh.program_id = k.program_id AND lh.field = k.field
  LEFT JOIN public.host_protection hp ON hp.host = k.host
  LEFT JOIN collisions c ON c.norm_key = k.norm_key;

GRANT SELECT ON public.link_verification_state TO authenticated;