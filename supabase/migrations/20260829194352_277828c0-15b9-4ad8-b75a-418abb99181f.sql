REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_manager() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;