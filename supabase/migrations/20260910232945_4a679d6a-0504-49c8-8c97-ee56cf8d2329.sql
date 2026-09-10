CREATE TABLE public.link_clear_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  university_id uuid REFERENCES public.universities(id),
  program_id uuid NOT NULL REFERENCES public.programs(id),
  field text NOT NULL,
  prior_value text NOT NULL,
  group_id text,
  shared_address text,
  determination text,
  evidence text,
  restored_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX link_clear_archive_run_idx ON public.link_clear_archive (run_id);
CREATE INDEX link_clear_archive_program_idx ON public.link_clear_archive (program_id);
GRANT SELECT, INSERT ON public.link_clear_archive TO authenticated;
GRANT ALL ON public.link_clear_archive TO service_role;
ALTER TABLE public.link_clear_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins can read link clear archive" ON public.link_clear_archive FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "Superadmins can record link clear archive" ON public.link_clear_archive FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());