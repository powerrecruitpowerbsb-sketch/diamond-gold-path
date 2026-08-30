CREATE TABLE public.ingestion_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  started_by uuid REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'running',
  url_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposals_created integer NOT NULL DEFAULT 0,
  snapshot_written boolean NOT NULL DEFAULT false,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_runs_program_idx ON public.ingestion_runs (program_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_runs TO authenticated;
GRANT ALL ON public.ingestion_runs TO service_role;

ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage ingestion runs"
  ON public.ingestion_runs FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TRIGGER ingestion_runs_touch
  BEFORE UPDATE ON public.ingestion_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();