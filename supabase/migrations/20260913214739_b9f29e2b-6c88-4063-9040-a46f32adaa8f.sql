REVOKE EXECUTE ON FUNCTION public.program_relationship_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_linked_athlete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linked_athlete(uuid) TO authenticated;