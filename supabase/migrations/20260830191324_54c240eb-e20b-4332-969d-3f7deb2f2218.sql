ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS ipeds_unitid integer,
  ADD COLUMN IF NOT EXISTS federal_match_status text NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS federal_match_name text,
  ADD COLUMN IF NOT EXISTS federal_synced_at timestamptz;

ALTER TABLE public.universities
  ADD CONSTRAINT universities_federal_match_status_check
  CHECK (federal_match_status IN ('unmatched', 'matched', 'ambiguous', 'not_found', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS universities_ipeds_unitid_key
  ON public.universities (ipeds_unitid) WHERE ipeds_unitid IS NOT NULL;

CREATE TABLE public.ingest_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  leased_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingest_queue_stage_check CHECK (stage IN ('federal_data', 'url_discovery', 'program_scrape')),
  CONSTRAINT ingest_queue_status_check CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  CONSTRAINT ingest_queue_target_check CHECK (university_id IS NOT NULL OR program_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingest_queue TO authenticated;
GRANT ALL ON public.ingest_queue TO service_role;

ALTER TABLE public.ingest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage the ingest queue"
  ON public.ingest_queue FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE UNIQUE INDEX ingest_queue_university_stage_key
  ON public.ingest_queue (university_id, stage) WHERE program_id IS NULL;

CREATE UNIQUE INDEX ingest_queue_program_stage_key
  ON public.ingest_queue (program_id, stage) WHERE program_id IS NOT NULL;

CREATE INDEX ingest_queue_pickup_idx ON public.ingest_queue (stage, status, created_at);

CREATE TRIGGER ingest_queue_touch_updated_at
  BEFORE UPDATE ON public.ingest_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();