REVOKE ALL ON FUNCTION public.audit_row_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_row_changes() TO service_role;