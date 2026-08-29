REVOKE EXECUTE ON FUNCTION public.active_season_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_wide_access() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.coaches_team(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_athlete(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.active_season_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_wide_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coaches_team(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_athlete(uuid) TO authenticated, service_role;