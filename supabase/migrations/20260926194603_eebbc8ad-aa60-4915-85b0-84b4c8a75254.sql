GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_videos TO authenticated;
GRANT ALL ON public.athlete_videos TO service_role;
ALTER TABLE public.athlete_videos ADD COLUMN IF NOT EXISTS poster_path text;
ALTER TABLE public.org_athletes ADD COLUMN IF NOT EXISTS transcript_path text, ADD COLUMN IF NOT EXISTS transcript_uploaded_at timestamptz;
UPDATE public.athlete_videos SET category='bp' WHERE category='speed';

CREATE POLICY "athlete docs readable by staff and family" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='athlete-docs' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "athlete docs writable by staff and family" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='athlete-docs' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "athlete docs removable by staff and family" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='athlete-docs' AND (public.can_access_athlete(((storage.foldername(name))[1])::uuid) OR public.is_linked_athlete(((storage.foldername(name))[1])::uuid)));