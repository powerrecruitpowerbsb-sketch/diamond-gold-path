DELETE FROM public.athlete_saved_schools a
USING public.athlete_saved_schools b
WHERE a.org_athlete_id = b.org_athlete_id
  AND a.program_id = b.program_id
  AND a.ctid > b.ctid;

ALTER TABLE public.athlete_saved_schools
  ADD CONSTRAINT athlete_saved_schools_athlete_program_key
  UNIQUE (org_athlete_id, program_id);