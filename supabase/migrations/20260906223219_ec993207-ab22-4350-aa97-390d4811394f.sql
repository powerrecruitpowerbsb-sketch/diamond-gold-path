-- lovable-cron-fallback-reviewed: 288 runs/day; recovery backstop while a nationwide collection run is active — the external runner can die mid-pass leaving leased jobs stuck with no row change to react to, and a 5-minute check bounds lost collection time; the function exits immediately when collection is stopped.
CREATE OR REPLACE FUNCTION public.collection_watchdog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.collection_state;
  _freed integer := 0;
  _retried integer := 0;
  _rearmed boolean := false;
  _quiet_minutes numeric := NULL;
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';
  IF _row.id IS NULL OR NOT _row.is_running OR _row.stop_requested THEN
    RETURN jsonb_build_object('running', false, 'freed', 0, 'retried', 0, 'rearmed', false);
  END IF;

  _freed := public.reclaim_stale_leases(15);

  WITH retry AS (
    UPDATE public.ingest_queue
       SET status = 'pending', leased_at = NULL, updated_at = now()
     WHERE status = 'failed'
       AND attempts < 3
    RETURNING 1
  )
  SELECT count(*)::integer INTO _retried FROM retry;

  IF _row.last_beat_at IS NOT NULL THEN
    _quiet_minutes := EXTRACT(EPOCH FROM (now() - _row.last_beat_at)) / 60;
  END IF;

  IF _row.last_beat_at IS NULL OR _quiet_minutes > 10 THEN
    PERFORM public.trigger_collection_runner();
    _rearmed := true;
    UPDATE public.collection_state
       SET last_message = 'Run had gone quiet - restarted automatically'
     WHERE id = 'singleton';
  END IF;

  RETURN jsonb_build_object(
    'running', true,
    'freed', _freed,
    'retried', _retried,
    'rearmed', _rearmed,
    'quiet_minutes', _quiet_minutes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.collection_watchdog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collection_watchdog() FROM anon;
REVOKE ALL ON FUNCTION public.collection_watchdog() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.collection_watchdog() TO service_role;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'power-recruit-watchdog';
SELECT cron.schedule('power-recruit-watchdog', '*/5 * * * *', $$SELECT public.collection_watchdog();$$);