REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_manager() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) FROM authenticated;