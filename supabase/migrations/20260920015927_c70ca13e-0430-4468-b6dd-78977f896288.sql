CREATE TABLE IF NOT EXISTS public.crawl_progress (
  pass text NOT NULL,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status text NOT NULL,
  players integer NOT NULL DEFAULT 0,
  reason text,
  outcome jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pass, program_id)
);

GRANT SELECT ON public.crawl_progress TO authenticated;
GRANT ALL ON public.crawl_progress TO service_role;

ALTER TABLE public.crawl_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read crawl progress"
  ON public.crawl_progress FOR SELECT
  TO authenticated
  USING (public.is_superadmin());