DROP POLICY IF EXISTS "org branding admin write" ON storage.objects;
DROP POLICY IF EXISTS "org branding admin update" ON storage.objects;
DROP POLICY IF EXISTS "org branding admin delete" ON storage.objects;

CREATE POLICY "org branding admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.is_org_admin_level()
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));

CREATE POLICY "org branding admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.is_org_admin_level()
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ))
  WITH CHECK (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.is_org_admin_level()
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));

CREATE POLICY "org branding admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'org-branding' AND (
    public.is_superadmin()
    OR (public.is_org_admin_level()
        AND (storage.foldername(name))[1] = public.current_org_id()::text)
  ));