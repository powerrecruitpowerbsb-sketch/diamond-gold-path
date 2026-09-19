ALTER FUNCTION public.completion_counts(integer[]) SECURITY INVOKER;
ALTER FUNCTION public.collection_queue_counts() SECURITY INVOKER;
ALTER FUNCTION public.program_gaps(integer[], integer) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.completion_counts(integer[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.collection_queue_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.program_gaps(integer[], integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.completion_counts(integer[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collection_queue_counts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.program_gaps(integer[], integer) TO authenticated, service_role;