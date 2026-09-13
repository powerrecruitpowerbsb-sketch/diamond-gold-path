ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS seat_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('founding', 'standard', 'enterprise'));

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_seat_count_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_seat_count_check
  CHECK (seat_count >= 0 AND seat_count <= 1000);

COMMENT ON COLUMN public.organizations.plan IS 'Commercial plan the organization is on.';
COMMENT ON COLUMN public.organizations.seat_count IS 'Staff seats purchased; 0 means unlimited is not implied, it means unset.';

UPDATE public.organizations SET plan = 'founding' WHERE is_founding_free_org AND plan = 'standard';