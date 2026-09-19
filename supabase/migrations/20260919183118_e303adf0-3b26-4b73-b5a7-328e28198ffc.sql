ALTER TABLE public.org_athletes
  ADD COLUMN IF NOT EXISTS sport public.sport NOT NULL DEFAULT 'baseball';

CREATE INDEX IF NOT EXISTS org_athletes_org_sport_idx
  ON public.org_athletes (organization_id, sport);