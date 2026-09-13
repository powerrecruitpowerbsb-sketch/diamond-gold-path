-- Owner-level helpers
CREATE OR REPLACE FUNCTION public.is_org_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'org_owner'::public.user_type);
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_level()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'org_owner'::public.user_type)
      OR public.has_role(auth.uid(), 'org_admin'::public.user_type);
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_owner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin_level() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin_level() TO authenticated;

-- Owner counts as a manager everywhere org_staff/org_admin did
CREATE OR REPLACE FUNCTION public.is_org_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'org_owner'::public.user_type)
      OR public.has_role(auth.uid(), 'org_admin'::public.user_type)
      OR public.has_role(auth.uid(), 'org_staff'::public.user_type);
$$;

-- Branding: owner only
DROP POLICY IF EXISTS "organizations org admin updates own branding" ON public.organizations;
CREATE POLICY "organizations owner updates own branding"
  ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND public.is_org_owner())
  WITH CHECK (id = public.current_org_id() AND public.is_org_owner());

-- Admin-level (owner or admin) write policies
DROP POLICY IF EXISTS "seasons org admin manage" ON public.seasons;
CREATE POLICY "seasons org admin manage" ON public.seasons FOR ALL TO authenticated
  USING (public.is_org_admin_level() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin_level() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "teams org admin manage" ON public.teams;
CREATE POLICY "teams org admin manage" ON public.teams FOR ALL TO authenticated
  USING (public.is_org_admin_level() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin_level() AND organization_id = public.current_org_id());

DROP POLICY IF EXISTS "team_coaches org admin manage" ON public.team_coaches;
CREATE POLICY "team_coaches org admin manage" ON public.team_coaches FOR ALL TO authenticated
  USING (public.is_org_admin_level() AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = team_coaches.team_id AND t.organization_id = public.current_org_id()))
  WITH CHECK (public.is_org_admin_level() AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = team_coaches.team_id AND t.organization_id = public.current_org_id()));

DROP POLICY IF EXISTS "intel org admin writes" ON public.recruiting_intelligence;
CREATE POLICY "intel org admin writes" ON public.recruiting_intelligence FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin_level())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin_level());

DROP POLICY IF EXISTS "relationships org admin writes" ON public.program_relationships;
CREATE POLICY "relationships org admin writes" ON public.program_relationships FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin_level())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin_level());

-- Relationship strength: owner or admin
CREATE OR REPLACE FUNCTION public.guard_relationship_strength()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE may_rate boolean;
BEGIN
  may_rate := public.is_superadmin() OR public.is_org_admin_level();
  IF may_rate THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.strength_label IS NOT NULL OR NEW.relationship_strength IS NOT NULL THEN
      RAISE EXCEPTION 'Only an organization owner or admin can set relationship strength';
    END IF;
  ELSE
    IF NEW.strength_label IS DISTINCT FROM OLD.strength_label
       OR NEW.relationship_strength IS DISTINCT FROM OLD.relationship_strength THEN
      RAISE EXCEPTION 'Only an organization owner or admin can set relationship strength';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Billing guard: plan/seats stay staff-only; the owner may set the billing contact
CREATE OR REPLACE FUNCTION public.guard_organization_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_superadmin() THEN RETURN NEW; END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.seat_count IS DISTINCT FROM OLD.seat_count
     OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
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

  IF NEW.billing_contact_email IS DISTINCT FROM OLD.billing_contact_email
     AND NOT public.is_org_owner() THEN
    RAISE EXCEPTION 'Only the organization owner can change the billing contact';
  END IF;

  RETURN NEW;
END;
$$;