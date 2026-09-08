CREATE TYPE public.link_health_status AS ENUM ('verified', 'unverified', 'dead');
CREATE TYPE public.fetch_method AS ENUM ('direct', 'rendered');
CREATE TYPE public.page_failure_category AS ENUM ('timeout', 'connection_blocked', 'http_error', 'empty_content', 'not_found');

CREATE TABLE public.link_health (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  field text NOT NULL,
  url text,
  link_status public.link_health_status NOT NULL DEFAULT 'unverified',
  last_verified_ok_at timestamptz,
  fetch_method public.fetch_method,
  consecutive_failures integer NOT NULL DEFAULT 0,
  failure_dates date[] NOT NULL DEFAULT '{}',
  not_found_runs integer NOT NULL DEFAULT 0,
  last_failure_category public.page_failure_category,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT link_health_program_field_key UNIQUE (program_id, field)
);

GRANT SELECT ON public.link_health TO authenticated;
GRANT ALL ON public.link_health TO service_role;

ALTER TABLE public.link_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read link health"
  ON public.link_health FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE INDEX link_health_status_idx ON public.link_health (link_status);
CREATE INDEX link_health_failures_idx ON public.link_health (consecutive_failures DESC);

CREATE TRIGGER link_health_touch_updated_at
  BEFORE UPDATE ON public.link_health
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.unreadable_pages
  ADD COLUMN failure_category public.page_failure_category;