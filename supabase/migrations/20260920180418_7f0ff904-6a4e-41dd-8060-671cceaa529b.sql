GRANT SELECT, UPDATE ON public.link_health TO authenticated;
GRANT ALL ON public.link_health TO service_role;
CREATE POLICY "Superadmins can update link health" ON public.link_health FOR UPDATE TO authenticated USING (is_superadmin()) WITH CHECK (is_superadmin());