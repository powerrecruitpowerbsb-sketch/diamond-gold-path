REVOKE ALL ON FUNCTION public.enqueue_due_refreshes(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_due_refreshes(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_due_refreshes(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_refreshes(integer, integer) TO service_role;