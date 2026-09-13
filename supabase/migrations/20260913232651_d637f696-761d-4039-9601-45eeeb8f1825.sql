CREATE TABLE IF NOT EXISTS public.admin_acting_org (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_acting_org TO authenticated;
GRANT ALL ON public.admin_acting_org TO service_role;

ALTER TABLE public.admin_acting_org ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acting org staff own row" ON public.admin_acting_org FOR ALL TO authenticated
  USING (public.is_superadmin() AND user_id = auth.uid())
  WITH CHECK (public.is_superadmin() AND user_id = auth.uid());

CREATE TRIGGER admin_acting_org_touch BEFORE UPDATE ON public.admin_acting_org
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();