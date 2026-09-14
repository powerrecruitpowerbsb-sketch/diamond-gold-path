ALTER TABLE public.roster_players
  ADD COLUMN IF NOT EXISTS position_raw text,
  ADD COLUMN IF NOT EXISTS class_year_raw text,
  ADD COLUMN IF NOT EXISTS bats_raw text,
  ADD COLUMN IF NOT EXISTS throws_raw text;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS division_raw text,
  ADD COLUMN IF NOT EXISTS conference_raw text;

CREATE INDEX IF NOT EXISTS roster_players_position_raw_idx ON public.roster_players (position_raw) WHERE position_raw IS NOT NULL;
CREATE INDEX IF NOT EXISTS roster_players_class_year_raw_idx ON public.roster_players (class_year_raw) WHERE class_year_raw IS NOT NULL;