-- lovable-cron-fallback-reviewed: 1440 runs/day; bounded queue of ~7,100 scrape jobs worked in small paced passes; scheduled on start, unschedules itself on drain or stop.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.collection_state
  ADD COLUMN IF NOT EXISTS runner_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS runner_url text,
  ADD COLUMN IF NOT EXISTS discovery_per_tick integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS scrape_per_tick integer NOT NULL DEFAULT 6;

UPDATE public.collection_state
   SET runner_url = COALESCE(runner_url, 'https://project--22d6cec7-bc5c-43e5-82ee-df62e50746fc-dev.lovable.app/api/public/collection-runner')
 WHERE id = 'singleton';

-- The runner key must never reach a browser, so column-level reads replace the
-- table-wide grant.
REVOKE SELECT ON public.collection_state FROM authenticated;
GRANT SELECT (id, is_running, stop_requested, started_at, last_beat_at, links_found,
  links_applied, programs_scraped, players_found, failures, last_message, created_at,
  updated_at, runner_url, discovery_per_tick, scrape_per_tick)
  ON public.collection_state TO authenticated;

CREATE OR REPLACE FUNCTION public.collection_cron_stop()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'power-recruit-collection';
END;
$$;

CREATE OR REPLACE FUNCTION public.collection_cron_start()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  PERFORM public.collection_cron_stop();
  PERFORM cron.schedule('power-recruit-collection', '* * * * *',
    $inner$SELECT public.trigger_collection_runner();$inner$);
END;
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
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';

  -- Nothing to do, or asked to stop: take the schedule away entirely.
  IF _row.id IS NULL OR NOT _row.is_running OR _row.stop_requested OR _row.runner_url IS NULL THEN
    PERFORM public.collection_cron_stop();
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
    PERFORM public.collection_cron_stop();
    RETURN;
  END IF;

  PERFORM extensions.http_post(
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

REVOKE ALL ON FUNCTION public.trigger_collection_runner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collection_cron_stop() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collection_cron_start() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collection_cron_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.collection_cron_stop() TO authenticated;