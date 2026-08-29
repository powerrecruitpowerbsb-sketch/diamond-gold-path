CREATE TYPE public.athlete_data_source AS ENUM ('manual','csv','handled','curve_testing');
CREATE TYPE public.saved_school_status AS ENUM ('researching','contacted','offered','committed','eliminated');

CREATE TABLE public.org_athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  grad_year integer,
  primary_position text,
  bats public.bats_hand,
  throws public.throws_hand,
  linked_parent_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  linked_handled_profile_id text,
  athlete_data_source public.athlete_data_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_athletes_org_idx ON public.org_athletes (organization_id);
CREATE INDEX org_athletes_grad_year_idx ON public.org_athletes (organization_id, grad_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_athletes TO authenticated;
GRANT ALL ON public.org_athletes TO service_role;
ALTER TABLE public.org_athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_athletes org managers scoped" ON public.org_athletes
  FOR ALL TO authenticated
  USING (public.is_org_manager() AND organization_id IS NOT NULL AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_manager() AND organization_id IS NOT NULL AND organization_id = public.current_org_id());
CREATE POLICY "org_athletes superadmin full access" ON public.org_athletes
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.athlete_saved_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status public.saved_school_status NOT NULL DEFAULT 'researching',
  added_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_athlete_id, program_id)
);
CREATE INDEX athlete_saved_schools_athlete_idx ON public.athlete_saved_schools (org_athlete_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_saved_schools TO authenticated;
GRANT ALL ON public.athlete_saved_schools TO service_role;
ALTER TABLE public.athlete_saved_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athlete_saved_schools org managers scoped" ON public.athlete_saved_schools
  FOR ALL TO authenticated
  USING (public.is_org_manager() AND EXISTS (
    SELECT 1 FROM public.org_athletes a
     WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()))
  WITH CHECK (public.is_org_manager() AND EXISTS (
    SELECT 1 FROM public.org_athletes a
     WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()));
CREATE POLICY "athlete_saved_schools superadmin full access" ON public.athlete_saved_schools
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.org_player_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note text NOT NULL,
  visible_to_parent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_player_notes_athlete_idx ON public.org_player_notes (org_athlete_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_player_notes TO authenticated;
GRANT ALL ON public.org_player_notes TO service_role;
ALTER TABLE public.org_player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_player_notes org managers scoped" ON public.org_player_notes
  FOR ALL TO authenticated
  USING (public.is_org_manager() AND EXISTS (
    SELECT 1 FROM public.org_athletes a
     WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()))
  WITH CHECK (public.is_org_manager() AND EXISTS (
    SELECT 1 FROM public.org_athletes a
     WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()));
CREATE POLICY "org_player_notes superadmin full access" ON public.org_player_notes
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TRIGGER org_athletes_touch BEFORE UPDATE ON public.org_athletes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER athlete_saved_schools_touch BEFORE UPDATE ON public.athlete_saved_schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_org_athletes AFTER INSERT OR UPDATE OR DELETE ON public.org_athletes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_athlete_saved_schools AFTER INSERT OR UPDATE OR DELETE ON public.athlete_saved_schools
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_org_player_notes AFTER INSERT OR UPDATE OR DELETE ON public.org_player_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();