CREATE TABLE public.university_website_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  university_id uuid NOT NULL REFERENCES public.universities(id),
  prior_value text,
  new_value text NOT NULL,
  note text,
  restored_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX university_website_archive_run_idx ON public.university_website_archive (run_id);
CREATE INDEX university_website_archive_university_idx ON public.university_website_archive (university_id);
GRANT SELECT, INSERT ON public.university_website_archive TO authenticated;
GRANT ALL ON public.university_website_archive TO service_role;
ALTER TABLE public.university_website_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can read university website archive" ON public.university_website_archive FOR SELECT TO authenticated USING (is_superadmin());
CREATE POLICY "Superadmins can record university website archive" ON public.university_website_archive FOR INSERT TO authenticated WITH CHECK (is_superadmin());