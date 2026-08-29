-- Branding is the one thing an org admin may change on their own organization.
-- Column-level grants keep billing/identity fields out of reach; the policy
-- keeps them inside their own organization row.
GRANT UPDATE (logo_url, brand_primary_color, brand_accent_color) ON public.organizations TO authenticated;

CREATE POLICY "organizations org admin updates own branding"
ON public.organizations FOR UPDATE TO authenticated
USING (id = public.current_org_id() AND public.has_role(auth.uid(), 'org_admin'::public.user_type))
WITH CHECK (id = public.current_org_id() AND public.has_role(auth.uid(), 'org_admin'::public.user_type));