REVOKE ALL ON FUNCTION public.hash_invite_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_code_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_row_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_university_majors() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_invite_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invite_code_valid(text) TO service_role;