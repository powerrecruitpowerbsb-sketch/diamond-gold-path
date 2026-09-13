REVOKE ALL ON FUNCTION public.is_org_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_admin_level() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin_level() TO authenticated, service_role;