GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_manager() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) TO authenticated, anon;