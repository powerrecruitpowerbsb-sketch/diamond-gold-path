-- ============================================================================
-- Step 12 — identity states, reversible retirement, campus identity,
--           and joint athletics programs.   REVIEW ONLY — not yet applied.
-- Nothing in this migration deletes or rewrites an existing value.
-- ============================================================================

-- 1. How a school record is identified ---------------------------------------
DO $$ BEGIN
  CREATE TYPE public.school_identity_basis AS ENUM (
    'federal_id',            -- holds its own IPEDS unitid
    'campus_of_federal_id',  -- a campus under another record's unitid
    'governing_body',        -- recruitable, no federal ID (Canadian, joint, unlisted)
    'unidentified'           -- neither: needs a decision
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS identity_basis public.school_identity_basis
    NOT NULL DEFAULT 'unidentified',
  ADD COLUMN IF NOT EXISTS campus_name text,
  ADD COLUMN IF NOT EXISTS identity_note text,
  -- reversible retirement
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_reason text,
  ADD COLUMN IF NOT EXISTS retirement_run_id uuid;

COMMENT ON COLUMN public.universities.identity_basis IS
  'Federal identity is how we identify a school; governing body membership is what makes it recruitable. Both are first-class.';
COMMENT ON COLUMN public.universities.campus_name IS
  'Set on campus records that share a parent unitid, e.g. "Catonsville". Empty on the main record.';

-- Backfill, no value overwritten: every school gets the basis it already has.
UPDATE public.universities u SET identity_basis = 'federal_id'
 WHERE u.ipeds_unitid IS NOT NULL AND u.identity_basis = 'unidentified';

UPDATE public.universities u SET identity_basis = 'governing_body'
 WHERE u.ipeds_unitid IS NULL
   AND u.identity_basis = 'unidentified'
   AND EXISTS (SELECT 1 FROM public.programs p
                WHERE p.university_id = u.id AND p.governing_body IS NOT NULL);

-- 2. Campus identity: several records may share one unitid ONLY when the campus
--    has been registered in advance. Naming a campus is NOT sufficient.
CREATE TABLE IF NOT EXISTS public.federal_id_campus_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipeds_unitid integer NOT NULL,
  campus_name text NOT NULL,
  note text,
  approved_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ipeds_unitid, campus_name)
);
GRANT SELECT ON public.federal_id_campus_registry TO authenticated;
GRANT ALL ON public.federal_id_campus_registry TO service_role;
ALTER TABLE public.federal_id_campus_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campus registry readable by authenticated"
  ON public.federal_id_campus_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "campus registry writable by superadmin"
  ON public.federal_id_campus_registry FOR ALL TO authenticated
  USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP INDEX IF EXISTS public.universities_ipeds_unitid_key;
CREATE UNIQUE INDEX universities_unitid_campus_key
  ON public.universities (ipeds_unitid, coalesce(campus_name, ''))
  WHERE ipeds_unitid IS NOT NULL;

-- A second record on one unitid must name its campus AND that exact campus must
-- already be registered. A duplicate record cannot pass by inventing a name.
CREATE OR REPLACE FUNCTION public.guard_campus_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE siblings integer; registered boolean;
BEGIN
  IF NEW.ipeds_unitid IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO siblings FROM public.universities
   WHERE ipeds_unitid = NEW.ipeds_unitid AND id <> NEW.id AND retired_at IS NULL;
  IF siblings > 0 THEN
    IF coalesce(NEW.campus_name, '') = '' THEN
      RAISE EXCEPTION 'unitid % is already held; a second record must be a registered campus', NEW.ipeds_unitid;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.federal_id_campus_registry r
                    WHERE r.ipeds_unitid = NEW.ipeds_unitid
                      AND lower(btrim(r.campus_name)) = lower(btrim(NEW.campus_name)))
      INTO registered;
    IF NOT registered THEN
      RAISE EXCEPTION 'campus "%" is not registered for unitid % — register it deliberately or resolve the duplicate',
        NEW.campus_name, NEW.ipeds_unitid;
    END IF;
    NEW.identity_basis := 'campus_of_federal_id';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_campus_identity ON public.universities;
CREATE TRIGGER guard_campus_identity
  BEFORE INSERT OR UPDATE OF ipeds_unitid, campus_name, identity_basis
  ON public.universities FOR EACH ROW
  EXECUTE FUNCTION public.guard_campus_identity();


-- Retirement is reversible in one operation: clear retired_at for the run id.
CREATE INDEX IF NOT EXISTS universities_retired_idx
  ON public.universities (retired_at) WHERE retired_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS universities_retirement_run_idx
  ON public.universities (retirement_run_id) WHERE retirement_run_id IS NOT NULL;

-- 3. Joint athletics: one team, several member schools ------------------------
CREATE TABLE IF NOT EXISTS public.program_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, university_id)
);

GRANT SELECT ON public.program_schools TO authenticated;
GRANT ALL ON public.program_schools TO service_role;
ALTER TABLE public.program_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_schools readable by authenticated"
  ON public.program_schools FOR SELECT TO authenticated USING (true);
CREATE POLICY "program_schools writable by superadmin"
  ON public.program_schools FOR ALL TO authenticated
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- Exactly one primary member per program, and it is programs.university_id.
CREATE UNIQUE INDEX program_schools_one_primary
  ON public.program_schools (program_id) WHERE is_primary;
CREATE INDEX program_schools_university_idx
  ON public.program_schools (university_id);

CREATE TRIGGER program_schools_touch
  BEFORE UPDATE ON public.program_schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.guard_program_primary_school()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE anchor uuid;
BEGIN
  IF NEW.is_primary THEN
    SELECT university_id INTO anchor FROM public.programs WHERE id = NEW.program_id;
    IF anchor IS DISTINCT FROM NEW.university_id THEN
      RAISE EXCEPTION 'the primary member must be the program anchor (programs.university_id)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_program_primary_school ON public.program_schools;
CREATE TRIGGER guard_program_primary_school
  BEFORE INSERT OR UPDATE ON public.program_schools
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_primary_school();

-- Backfill: every existing program keeps exactly the school it has today.
INSERT INTO public.program_schools (program_id, university_id, is_primary)
SELECT p.id, p.university_id, true FROM public.programs p
ON CONFLICT (program_id, university_id) DO NOTHING;

-- Keep the join table in step with the anchor when a program is re-anchored.
CREATE OR REPLACE FUNCTION public.sync_program_primary_school()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.university_id IS DISTINCT FROM OLD.university_id THEN
    UPDATE public.program_schools SET is_primary = false
     WHERE program_id = NEW.id AND is_primary;
    INSERT INTO public.program_schools (program_id, university_id, is_primary)
    VALUES (NEW.id, NEW.university_id, true)
    ON CONFLICT (program_id, university_id) DO UPDATE SET is_primary = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_program_primary_school ON public.programs;
CREATE TRIGGER sync_program_primary_school
  AFTER INSERT OR UPDATE OF university_id ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.sync_program_primary_school();

-- 4. One place for product surfaces and sweeps to read from -------------------
CREATE OR REPLACE VIEW public.active_universities AS
  SELECT * FROM public.universities WHERE retired_at IS NULL;

GRANT SELECT ON public.active_universities TO authenticated;

-- ============================================================================
-- 5. Quarantine division and conference until confirmed against a member list
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.value_verification AS ENUM ('unverified','verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS division_verification public.value_verification
    NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS conference_verification public.value_verification
    NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS division_source text,
  ADD COLUMN IF NOT EXISTS conference_source text,
  ADD COLUMN IF NOT EXISTS division_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS conference_verified_at timestamptz;

COMMENT ON COLUMN public.programs.division_verification IS
  'Unverified values are never used as a search filter and are shown as "not confirmed".';

-- Any later edit to the value drops it back to unverified.
CREATE OR REPLACE FUNCTION public.reset_level_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.division IS DISTINCT FROM OLD.division
     OR NEW.governing_body IS DISTINCT FROM OLD.governing_body THEN
    IF NEW.division_verification = OLD.division_verification THEN
      NEW.division_verification := 'unverified';
      NEW.division_verified_at := NULL;
    END IF;
  END IF;
  IF NEW.conference IS DISTINCT FROM OLD.conference
     OR NEW.governing_body IS DISTINCT FROM OLD.governing_body THEN
    IF NEW.conference_verification = OLD.conference_verification THEN
      NEW.conference_verification := 'unverified';
      NEW.conference_verified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reset_level_verification ON public.programs;
CREATE TRIGGER reset_level_verification
  BEFORE UPDATE OF division, conference, governing_body ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.reset_level_verification();

-- Append-only archive so the junk clean-up and the verification pass are
-- reversible in one operation, by run id.
CREATE TABLE IF NOT EXISTS public.program_level_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  field text NOT NULL,
  prior_value text,
  new_value text,
  reason text,
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_level_archive_run_idx
  ON public.program_level_archive (run_id);
GRANT SELECT ON public.program_level_archive TO authenticated;
GRANT ALL ON public.program_level_archive TO service_role;
ALTER TABLE public.program_level_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "level archive readable by authenticated"
  ON public.program_level_archive FOR SELECT TO authenticated USING (true);
CREATE POLICY "level archive writable by superadmin"
  ON public.program_level_archive FOR INSERT TO authenticated
  WITH CHECK (is_superadmin());
