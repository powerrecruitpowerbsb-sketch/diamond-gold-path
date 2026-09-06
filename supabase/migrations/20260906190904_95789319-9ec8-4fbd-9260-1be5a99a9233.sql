ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS offering_source text,
  ADD COLUMN IF NOT EXISTS offering_evidence jsonb,
  ADD COLUMN IF NOT EXISTS offering_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sponsorship_checked_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS programs_offering_status_idx ON public.programs (offering_status);