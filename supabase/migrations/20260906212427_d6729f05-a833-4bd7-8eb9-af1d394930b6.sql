REVOKE ALL ON FUNCTION public.reclaim_stale_leases(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_leases(integer) TO service_role;