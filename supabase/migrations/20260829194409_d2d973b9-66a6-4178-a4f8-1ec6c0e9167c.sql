REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_manager() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_org_manager() TO service_role;