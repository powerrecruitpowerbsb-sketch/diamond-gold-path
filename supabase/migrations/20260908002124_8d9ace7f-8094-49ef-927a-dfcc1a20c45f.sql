REVOKE EXECUTE ON FUNCTION public.pages_check_on() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pages_check_on() TO service_role;