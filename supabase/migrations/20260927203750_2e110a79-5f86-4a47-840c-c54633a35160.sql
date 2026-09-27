-- lovable-cron-fallback-reviewed: autopilot runs once a day (1 run/day) and the federal facts tick every 10 min (144 runs/day) only posts when school-fact work is queued.
ALTER TABLE public.collection_state
  ADD COLUMN IF NOT EXISTS autopilot_on boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autopilot_last_run timestamptz,
  ADD COLUMN IF NOT EXISTS autopilot_last_note text;

CREATE OR REPLACE FUNCTION public.autopilot_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.collection_state;
  _q record;
  _left integer;
  _note text;
BEGIN
  SELECT * INTO _row FROM public.collection_state WHERE id = 'singleton';
  IF _row.id IS NULL OR NOT _row.autopilot_on THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'autopilot off');
  END IF;

  SELECT * INTO _q FROM public.enqueue_due_refreshes(500, 500);

  SELECT count(*) INTO _left FROM public.ingest_queue
   WHERE stage IN ('url_discovery', 'program_scrape')
     AND status IN ('pending', 'failed', 'running') AND attempts < 3;

  _note := format('%s rosters and %s schools sent for refresh', _q.programs_queued, _q.schools_queued);

  IF _left > 0 AND NOT _row.is_running AND _row.runner_url IS NOT NULL THEN
    UPDATE public.collection_state
       SET is_running = true, stop_requested = false, started_at = now(),
           last_message = 'Started by autopilot', last_beat_at = now()
     WHERE id = 'singleton';
    PERFORM public.collection_cron_unschedule();
    PERFORM cron.schedule('power-recruit-collection', '* * * * *',
      $inner$SELECT public.trigger_collection_runner();$inner$);
    _note := _note || format(' · roster refresh started (%s teams waiting)', _left);
  END IF;

  UPDATE public.collection_state
     SET autopilot_last_run = now(), autopilot_last_note = _note
   WHERE id = 'singleton';

  RETURN jsonb_build_object('ok', true, 'note', _note);
END;
$$;

CREATE OR REPLACE FUNCTION public.federal_tick()
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
  IF _row.id IS NULL OR NOT _row.autopilot_on OR _row.runner_url IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO _left FROM public.ingest_queue
   WHERE stage = 'federal_data' AND status IN ('pending', 'failed') AND attempts < 3;
  IF _left = 0 THEN RETURN; END IF;
  PERFORM net.http_post(
    url := replace(_row.runner_url, 'collection-runner', 'federal-runner'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _row.runner_token::text),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.autopilot_run_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN public.autopilot_tick();
END;
$$;

CREATE OR REPLACE FUNCTION public.autopilot_set(_on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.collection_state SET autopilot_on = _on WHERE id = 'singleton';
END;
$$;

REVOKE ALL ON FUNCTION public.autopilot_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.federal_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.autopilot_run_now() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.autopilot_set(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.autopilot_run_now() TO authenticated;
GRANT EXECUTE ON FUNCTION public.autopilot_set(boolean) TO authenticated;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('curve-recruit-autopilot', 'curve-recruit-federal');
SELECT cron.schedule('curve-recruit-autopilot', '0 8 * * *', $j$SELECT public.autopilot_tick();$j$);
SELECT cron.schedule('curve-recruit-federal', '*/10 * * * *', $j$SELECT public.federal_tick();$j$);