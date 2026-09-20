ALTER TABLE public.org_athletes ADD COLUMN IF NOT EXISTS photo_path text;

-- Photos live in a private bucket under <athlete_id>/..., so the folder name is
-- the athlete the caller must already be allowed to touch.
CREATE POLICY "athlete photos readable by staff and family"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'athlete-photos'
    AND (
      public.can_access_athlete(((storage.foldername(name))[1])::uuid)
      OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "athlete photos writable by staff and family"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'athlete-photos'
    AND (
      public.can_access_athlete(((storage.foldername(name))[1])::uuid)
      OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "athlete photos updatable by staff and family"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'athlete-photos'
    AND (
      public.can_access_athlete(((storage.foldername(name))[1])::uuid)
      OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "athlete photos removable by staff and family"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'athlete-photos'
    AND (
      public.can_access_athlete(((storage.foldername(name))[1])::uuid)
      OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)
    )
  );
