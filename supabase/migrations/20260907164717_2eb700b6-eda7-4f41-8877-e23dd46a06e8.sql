GRANT SELECT (current_wave, auto_advance) ON public.collection_state TO authenticated;

CREATE INDEX IF NOT EXISTS ingest_queue_status_updated_idx
  ON public.ingest_queue (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ingest_queue_program_status_idx
  ON public.ingest_queue (program_id, status);