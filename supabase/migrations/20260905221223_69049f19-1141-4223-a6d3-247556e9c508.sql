CREATE TABLE public.federal_directory (
  unitid integer PRIMARY KEY,
  name text NOT NULL,
  alias text,
  city text,
  state text,
  main_campus boolean,
  enrollment integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX federal_directory_state_idx ON public.federal_directory (state);

GRANT SELECT ON public.federal_directory TO authenticated;
GRANT ALL ON public.federal_directory TO service_role;

ALTER TABLE public.federal_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read the national directory"
  ON public.federal_directory FOR SELECT
  TO authenticated
  USING (public.is_superadmin());