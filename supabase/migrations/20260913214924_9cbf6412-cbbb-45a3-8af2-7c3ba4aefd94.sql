CREATE POLICY "relationships staff write own org" ON public.program_relationships
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_manager());

CREATE POLICY "relationships staff update own org" ON public.program_relationships
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_manager());

CREATE OR REPLACE FUNCTION public.guard_relationship_strength()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE may_rate boolean;
BEGIN
  may_rate := public.is_superadmin()
    OR public.has_role(auth.uid(), 'org_admin'::public.user_type);
  IF may_rate THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.strength_label IS NOT NULL OR NEW.relationship_strength IS NOT NULL THEN
      RAISE EXCEPTION 'Only an organization admin can set relationship strength';
    END IF;
  ELSE
    IF NEW.strength_label IS DISTINCT FROM OLD.strength_label
       OR NEW.relationship_strength IS DISTINCT FROM OLD.relationship_strength THEN
      RAISE EXCEPTION 'Only an organization admin can set relationship strength';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_relationship_strength() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_relationship_strength() FROM anon;
REVOKE ALL ON FUNCTION public.guard_relationship_strength() FROM authenticated;

DROP TRIGGER IF EXISTS guard_relationship_strength ON public.program_relationships;
CREATE TRIGGER guard_relationship_strength
  BEFORE INSERT OR UPDATE ON public.program_relationships
  FOR EACH ROW EXECUTE FUNCTION public.guard_relationship_strength();