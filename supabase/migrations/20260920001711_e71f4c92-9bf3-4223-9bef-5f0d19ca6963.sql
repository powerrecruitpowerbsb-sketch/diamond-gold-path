CREATE UNIQUE INDEX IF NOT EXISTS roster_snapshots_program_season_key
  ON public.roster_snapshots (program_id, season_year);