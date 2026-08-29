CREATE POLICY "org branding read own org" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (storage.foldername(name))[1] = public.current_org_id()::text
  ));

CREATE POLICY "org branding admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'org_admin'::public.user_type)
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));

CREATE POLICY "org branding admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'org_admin'::public.user_type)
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ))
  WITH CHECK (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'org_admin'::public.user_type)
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));

CREATE POLICY "org branding admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'org_admin'::public.user_type)
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));