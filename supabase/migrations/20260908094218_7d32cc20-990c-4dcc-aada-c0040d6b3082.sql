CREATE TABLE public.unreadable_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  field text NOT NULL,
  url text NOT NULL,
  error text,
  attempts integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX unreadable_pages_program_field_url_key
  ON public.unreadable_pages (program_id, field, url);
CREATE INDEX unreadable_pages_unresolved_idx
  ON public.unreadable_pages (resolved_at) WHERE resolved_at IS NULL;

GRANT SELECT ON public.unreadable_pages TO authenticated;
GRANT ALL ON public.unreadable_pages TO service_role;

ALTER TABLE public.unreadable_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read unreadable pages"
  ON public.unreadable_pages FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

CREATE TRIGGER unreadable_pages_touch
  BEFORE UPDATE ON public.unreadable_pages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();