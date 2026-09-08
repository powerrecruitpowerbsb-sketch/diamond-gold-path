-- lovable-cron-fallback-reviewed: 1440 runs/day; existing minute schedule only while a build stage is switched on, self-unschedules when idle; needed so page checking continues unattended with at most a 1-minute gap between batches
CREATE OR REPLACE FUNCTION public.pages_check_on()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.build_stages WHERE stage = 'pages' AND status = 'running'
  )
$$;

CREATE OR REPLACE FUNCTION public.trigger_collection_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.collection_state;
  _left integer;
  _pages boolean;
  _collecting boolean;
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';
  _pages := public.pages_check_on();

  IF _row.id IS NULL OR _row.runner_url IS NULL THEN
    PERFORM public.collection_cron_unschedule();
    RETURN;
  END IF;

  _collecting := _row.is_running AND NOT _row.stop_requested;

  IF NOT _collecting AND NOT _pages THEN
    PERFORM public.collection_cron_unschedule();
    RETURN;
  END IF;

  IF _collecting THEN
    SELECT count(*) INTO _left
      FROM public.ingest_queue
     WHERE stage IN ('url_discovery', 'program_scrape')
       AND (
         (status IN ('pending', 'failed') AND attempts < 3)
         OR status IN ('running', 'held')
       );

    IF _left = 0 THEN
      UPDATE public.collection_state
         SET is_running = false, last_message = 'All queued work is finished', last_beat_at = now()
       WHERE id = 'singleton';
      _collecting := false;
      IF NOT _pages THEN
        PERFORM public.collection_cron_unschedule();
        RETURN;
      END IF;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := _row.runner_url
      || '?discovery=' || _row.discovery_per_tick
      || '&scrape=' || _row.scrape_per_tick,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _row.runner_token::text
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.collection_watchdog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.collection_state;
  _freed integer := 0;
  _retried integer := 0;
  _rearmed boolean := false;
  _rescheduled boolean := false;
  _quiet_minutes numeric := NULL;
  _pages boolean;
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';
  _pages := public.pages_check_on();

  _freed := public.reclaim_stale_leases(15);

  IF _pages AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'power-recruit-collection') THEN
    PERFORM cron.schedule('power-recruit-collection', '* * * * *',
      $inner$SELECT public.trigger_collection_runner();$inner$);
    _rescheduled := true;
  END IF;

  IF _row.id IS NULL OR NOT _row.is_running OR _row.stop_requested THEN
    RETURN jsonb_build_object(
      'running', false, 'freed', _freed, 'retried', 0,
      'rearmed', false, 'rescheduled', _rescheduled, 'pages', _pages
    );
  END IF;

  WITH retry AS (
    UPDATE public.ingest_queue
       SET status = 'pending', leased_at = NULL, updated_at = now()
     WHERE status = 'failed'
       AND attempts < 3
    RETURNING 1
  )
  SELECT count(*)::integer INTO _retried FROM retry;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'power-recruit-collection') THEN
    PERFORM cron.schedule('power-recruit-collection', '* * * * *',
      $inner$SELECT public.trigger_collection_runner();$inner$);
    _rescheduled := true;
  END IF;

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
    'rescheduled', _rescheduled,
    'quiet_minutes', _quiet_minutes,
    'pages', _pages
  );
END;
$$;