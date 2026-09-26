ALTER TABLE public.athlete_saved_schools
  ADD COLUMN recommended_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN recommended_by_name text,
  ADD COLUMN recommended_at timestamptz,
  ADD COLUMN coach_message text;

CREATE OR REPLACE FUNCTION public.guard_coach_pick()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_org_manager() OR public.is_superadmin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.recommended_by_user_id := NULL; NEW.recommended_by_name := NULL;
    NEW.recommended_at := NULL; NEW.coach_message := NULL;
  ELSE
    NEW.recommended_by_user_id := OLD.recommended_by_user_id; NEW.recommended_by_name := OLD.recommended_by_name;
    NEW.recommended_at := OLD.recommended_at; NEW.coach_message := OLD.coach_message;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_coach_pick BEFORE INSERT OR UPDATE ON public.athlete_saved_schools
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_pick();

CREATE TABLE public.saved_school_staff_notes (
  saved_school_id uuid PRIMARY KEY REFERENCES public.athlete_saved_schools(id) ON DELETE CASCADE,
  note text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_school_staff_notes TO authenticated;
GRANT ALL ON public.saved_school_staff_notes TO service_role;
ALTER TABLE public.saved_school_staff_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff only" ON public.saved_school_staff_notes FOR ALL TO authenticated
USING (public.is_superadmin() OR (public.is_org_manager() AND EXISTS (
  SELECT 1 FROM public.athlete_saved_schools s JOIN public.org_athletes a ON a.id = s.org_athlete_id
  WHERE s.id = saved_school_id AND a.organization_id = public.current_org_id())))
WITH CHECK (public.is_superadmin() OR (public.is_org_manager() AND EXISTS (
  SELECT 1 FROM public.athlete_saved_schools s JOIN public.org_athletes a ON a.id = s.org_athlete_id
  WHERE s.id = saved_school_id AND a.organization_id = public.current_org_id())));
CREATE TRIGGER touch_staff_notes BEFORE UPDATE ON public.saved_school_staff_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();