-- 1. New enums ---------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.intel_visibility AS ENUM ('org_only','shared_with_families');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.intel_status AS ENUM ('draft','pending','approved','rejected','changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.relationship_strength_level AS ENUM ('strong','developing','minimal','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. New intelligence field types --------------------------------------------
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'portal_usage';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'juco_recruiting';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'hs_vs_transfer_lean';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'physical_traits_valued';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'development_philosophy';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'coaching_staff_reputation';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'program_stability';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'roster_needs';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'current_priorities';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'graduation_needs';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'staff_notes';
ALTER TYPE public.intel_field_type ADD VALUE IF NOT EXISTS 'players_previously_recruited';

-- 3. recruiting_intelligence --------------------------------------------------
ALTER TABLE public.recruiting_intelligence
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility public.intel_visibility NOT NULL DEFAULT 'org_only',
  ADD COLUMN IF NOT EXISTS status public.intel_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS structured_value text,
  ADD COLUMN IF NOT EXISTS positions text[],
  ADD COLUMN IF NOT EXISTS structured_detail jsonb,
  ADD COLUMN IF NOT EXISTS author_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS editor_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

UPDATE public.recruiting_intelligence
   SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
 WHERE organization_id IS NULL;

ALTER TABLE public.recruiting_intelligence ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.recruiting_intelligence
  DROP CONSTRAINT IF EXISTS recruiting_intelligence_program_id_field_type_key;
ALTER TABLE public.recruiting_intelligence
  ADD CONSTRAINT recruiting_intelligence_program_field_org_key
  UNIQUE (program_id, field_type, organization_id);

CREATE INDEX IF NOT EXISTS recruiting_intelligence_org_program_idx
  ON public.recruiting_intelligence (organization_id, program_id);
CREATE INDEX IF NOT EXISTS recruiting_intelligence_org_status_idx
  ON public.recruiting_intelligence (organization_id, status);
CREATE INDEX IF NOT EXISTS recruiting_intelligence_org_structured_idx
  ON public.recruiting_intelligence (organization_id, field_type, structured_value);
CREATE INDEX IF NOT EXISTS recruiting_intelligence_author_idx
  ON public.recruiting_intelligence (organization_id, author_user_id);
CREATE INDEX IF NOT EXISTS recruiting_intelligence_updated_idx
  ON public.recruiting_intelligence (organization_id, updated_at);

-- 4. program_relationships ----------------------------------------------------
ALTER TABLE public.program_relationships
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS strength_label public.relationship_strength_level,
  ADD COLUMN IF NOT EXISTS placed_players_before boolean,
  ADD COLUMN IF NOT EXISTS primary_college_contact text,
  ADD COLUMN IF NOT EXISTS program_stability_note text,
  ADD COLUMN IF NOT EXISTS visibility public.intel_visibility NOT NULL DEFAULT 'org_only';

UPDATE public.program_relationships
   SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
 WHERE organization_id IS NULL;

ALTER TABLE public.program_relationships ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.program_relationships
  DROP CONSTRAINT IF EXISTS program_relationships_program_id_key;
ALTER TABLE public.program_relationships
  ADD CONSTRAINT program_relationships_program_org_key UNIQUE (program_id, organization_id);

CREATE INDEX IF NOT EXISTS program_relationships_org_idx
  ON public.program_relationships (organization_id, program_id);

-- 5. interaction_log ----------------------------------------------------------
ALTER TABLE public.interaction_log
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.interaction_log
   SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
 WHERE organization_id IS NULL;

ALTER TABLE public.interaction_log ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS interaction_log_org_idx
  ON public.interaction_log (organization_id, interaction_date DESC);

-- 6. Conclusions (family-visible) vs evidence (staff only) --------------------
CREATE OR REPLACE FUNCTION public.intel_field_family_visible(_field_type text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT _field_type IN (
    'style_of_play','recruiting_philosophy','positions_prioritized',
    'preferred_player_profile','transfer_juco_tendencies','freshman_tendencies',
    'geographic_tendencies','recruiting_timeline','roster_construction_tendencies',
    'portal_usage','juco_recruiting','hs_vs_transfer_lean',
    'physical_traits_valued','development_philosophy'
  );
$$;

-- 7. Access rules -------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiting_intelligence TO authenticated;
GRANT ALL ON public.recruiting_intelligence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_relationships TO authenticated;
GRANT ALL ON public.program_relationships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interaction_log TO authenticated;
GRANT ALL ON public.interaction_log TO service_role;

DROP POLICY IF EXISTS "recruiting_intelligence readable by authenticated" ON public.recruiting_intelligence;
DROP POLICY IF EXISTS "recruiting_intelligence writable by superadmin" ON public.recruiting_intelligence;

CREATE POLICY "intel superadmin full access" ON public.recruiting_intelligence
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "intel staff read own org" ON public.recruiting_intelligence
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_manager());

CREATE POLICY "intel family read conclusions" ON public.recruiting_intelligence
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND status = 'approved'
    AND (visibility = 'shared_with_families'
         OR public.intel_field_family_visible(field_type::text))
  );

CREATE POLICY "intel org admin writes" ON public.recruiting_intelligence
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_role(auth.uid(), 'org_admin'::public.user_type))
  WITH CHECK (organization_id = public.current_org_id()
         AND public.has_role(auth.uid(), 'org_admin'::public.user_type));

CREATE POLICY "intel coach submits own" ON public.recruiting_intelligence
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id()
    AND public.has_role(auth.uid(), 'org_staff'::public.user_type)
    AND author_user_id = auth.uid()
    AND status IN ('draft','pending','changes_requested'));

CREATE POLICY "intel coach edits own in review" ON public.recruiting_intelligence
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
    AND public.has_role(auth.uid(), 'org_staff'::public.user_type)
    AND author_user_id = auth.uid()
    AND status IN ('draft','pending','changes_requested'))
  WITH CHECK (organization_id = public.current_org_id()
    AND author_user_id = auth.uid()
    AND status IN ('draft','pending','changes_requested'));

DROP POLICY IF EXISTS "program_relationships superadmin only" ON public.program_relationships;

CREATE POLICY "relationships superadmin full access" ON public.program_relationships
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "relationships staff read own org" ON public.program_relationships
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_manager());

CREATE POLICY "relationships org admin writes" ON public.program_relationships
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND public.has_role(auth.uid(), 'org_admin'::public.user_type))
  WITH CHECK (organization_id = public.current_org_id()
         AND public.has_role(auth.uid(), 'org_admin'::public.user_type));

DROP POLICY IF EXISTS "interaction_log superadmin only" ON public.interaction_log;

CREATE POLICY "interactions superadmin full access" ON public.interaction_log
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "interactions staff own org" ON public.interaction_log
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_manager());

-- 8. Families see the rating and the placed-players answer, nothing else -------
DROP VIEW IF EXISTS public.program_relationship_summary;
CREATE VIEW public.program_relationship_summary
WITH (security_invoker = off) AS
  SELECT r.program_id,
         r.organization_id,
         r.strength_label,
         r.placed_players_before
    FROM public.program_relationships r
   WHERE r.organization_id = public.current_org_id();

GRANT SELECT ON public.program_relationship_summary TO authenticated;

-- 9. Organization admins may change branding only; billing stays Power staff ---
CREATE OR REPLACE FUNCTION public.guard_organization_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_superadmin() THEN RETURN NEW; END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.seat_count IS DISTINCT FROM OLD.seat_count
     OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
     OR NEW.billing_contact_email IS DISTINCT FROM OLD.billing_contact_email
     OR NEW.annual_fee_amount IS DISTINCT FROM OLD.annual_fee_amount
     OR NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at
     OR NEW.is_founding_free_org IS DISTINCT FROM OLD.is_founding_free_org
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_invoice_id IS DISTINCT FROM OLD.stripe_invoice_id
     OR NEW.stripe_invoice_url IS DISTINCT FROM OLD.stripe_invoice_url
     OR NEW.invoice_sent_at IS DISTINCT FROM OLD.invoice_sent_at
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Only Power Recruit staff can change plan, seats or billing';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organization_billing ON public.organizations;
CREATE TRIGGER guard_organization_billing
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_billing();

-- 10. No default left on a tenant key ----------------------------------------
ALTER TABLE public.recruiting_intelligence ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.program_relationships ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.interaction_log ALTER COLUMN organization_id DROP DEFAULT;