-- Family members may update the athlete they are linked to.
CREATE POLICY "Family members update their linked athlete"
  ON public.org_athletes FOR UPDATE
  TO authenticated
  USING (public.is_linked_athlete(id))
  WITH CHECK (public.is_linked_athlete(id));

-- Family members manage their athlete's measurables.
CREATE POLICY "athlete_metrics linked family"
  ON public.athlete_metrics FOR ALL
  TO authenticated
  USING (public.is_linked_athlete(org_athlete_id))
  WITH CHECK (public.is_linked_athlete(org_athlete_id));

-- Family members manage their athlete's own events.
CREATE POLICY "schedule_events linked family"
  ON public.schedule_events FOR ALL
  TO authenticated
  USING (org_athlete_id IS NOT NULL AND public.is_linked_athlete(org_athlete_id))
  WITH CHECK (org_athlete_id IS NOT NULL AND public.is_linked_athlete(org_athlete_id));

-- Family members read the team events their athlete belongs to.
CREATE POLICY "schedule_events linked family read team events"
  ON public.schedule_events FOR SELECT
  TO authenticated
  USING (
    org_athlete_id IS NULL
    AND team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_athletes ta
       WHERE ta.team_id = schedule_events.team_id
         AND public.is_linked_athlete(ta.org_athlete_id)
    )
  );