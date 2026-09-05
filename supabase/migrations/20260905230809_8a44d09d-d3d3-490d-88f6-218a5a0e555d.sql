-- lovable-cron-fallback-reviewed: 1440 runs/day; bounded queue of ~7,100 scrape jobs worked in small paced passes; scheduled on start, unschedules itself on drain or stop.
CREATE OR REPLACE FUNCTION public.trigger_collection_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.collection_state;
  _left integer;
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';

  IF _row.id IS NULL OR NOT _row.is_running OR _row.stop_requested OR _row.runner_url IS NULL THEN
    PERFORM public.collection_cron_unschedule();
    RETURN;
  END IF;

  SELECT count(*) INTO _left
    FROM public.ingest_queue
   WHERE stage IN ('url_discovery', 'program_scrape')
     AND status IN ('pending', 'failed', 'running')
     AND attempts < 3;

  IF _left = 0 THEN
    UPDATE public.collection_state
       SET is_running = false, last_message = 'All queued work is finished', last_beat_at = now()
     WHERE id = 'singleton';
    PERFORM public.collection_cron_unschedule();
    RETURN;
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

REVOKE ALL ON FUNCTION public.trigger_collection_runner() FROM PUBLIC, anon, authenticated;