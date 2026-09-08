-- lovable-cron-fallback-reviewed: 1440 runs/day; unchanged existing minute schedule, only the per-request wait is shortened so one stuck request cannot block the queue
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
    timeout_milliseconds := 55000
  );
END;
$$;