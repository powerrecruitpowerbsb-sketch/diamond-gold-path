ALTER TABLE public.roster_snapshots
  ADD COLUMN IF NOT EXISTS source_domain text,
  ADD COLUMN IF NOT EXISTS reader text,
  ADD COLUMN IF NOT EXISTS ingest_run_id uuid,
  ADD COLUMN IF NOT EXISTS suspect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspect_reason text;

CREATE INDEX IF NOT EXISTS roster_snapshots_suspect_idx ON public.roster_snapshots (suspect);
CREATE INDEX IF NOT EXISTS roster_snapshots_source_domain_idx ON public.roster_snapshots (source_domain);

ALTER TABLE public.roster_players
  ADD COLUMN IF NOT EXISTS reader text;

CREATE INDEX IF NOT EXISTS roster_players_reader_idx ON public.roster_players (reader);