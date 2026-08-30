DO $$ BEGIN
  CREATE TYPE public.program_offering_status AS ENUM ('unverified', 'verified', 'not_offered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS offering_status public.program_offering_status NOT NULL DEFAULT 'unverified';

UPDATE public.programs SET offering_status = 'verified' WHERE offering_status = 'unverified';

CREATE INDEX IF NOT EXISTS programs_offering_status_idx ON public.programs (offering_status);