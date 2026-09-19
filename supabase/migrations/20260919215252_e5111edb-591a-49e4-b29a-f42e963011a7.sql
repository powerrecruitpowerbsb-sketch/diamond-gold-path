CREATE TABLE public.program_coach_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  coach_name text NOT NULL,
  coach_role text,
  email text,
  phone text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX program_coach_contacts_org_program_idx
  ON public.program_coach_contacts (organization_id, program_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_coach_contacts TO authenticated;
GRANT ALL ON public.program_coach_contacts TO service_role;

ALTER TABLE public.program_coach_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage coach contacts"
  ON public.program_coach_contacts FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Org members read their coach contacts"
  ON public.program_coach_contacts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "Org staff write their coach contacts"
  ON public.program_coach_contacts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.has_org_wide_access());

CREATE POLICY "Org staff update their coach contacts"
  ON public.program_coach_contacts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.has_org_wide_access())
  WITH CHECK (organization_id = public.current_org_id() AND public.has_org_wide_access());

CREATE POLICY "Org staff delete their coach contacts"
  ON public.program_coach_contacts FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.has_org_wide_access());

CREATE TRIGGER program_coach_contacts_touch
  BEFORE UPDATE ON public.program_coach_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();