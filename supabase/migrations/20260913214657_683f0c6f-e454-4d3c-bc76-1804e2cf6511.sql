DROP VIEW IF EXISTS public.program_relationship_summary;

CREATE OR REPLACE FUNCTION public.program_relationship_summary(_program_id uuid)
RETURNS TABLE(strength_label public.relationship_strength_level, placed_players_before boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.strength_label, r.placed_players_before
    FROM public.program_relationships r
   WHERE r.program_id = _program_id
     AND r.organization_id = public.current_org_id();
$$;

REVOKE ALL ON FUNCTION public.program_relationship_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.program_relationship_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.guard_organization_billing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_billing() FROM anon;
REVOKE ALL ON FUNCTION public.guard_organization_billing() FROM authenticated;

REVOKE ALL ON FUNCTION public.is_linked_athlete(uuid) FROM anon;