CREATE TABLE public.build_stages (
  stage text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  cursor text,
  checked integer NOT NULL DEFAULT 0,
  changed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  last_message text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT build_stages_status_check CHECK (status IN ('idle', 'running', 'done', 'blocked'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_stages TO authenticated;
GRANT ALL ON public.build_stages TO service_role;

ALTER TABLE public.build_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage build stages"
  ON public.build_stages FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TRIGGER build_stages_touch
  BEFORE UPDATE ON public.build_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.build_stages (stage) VALUES ('pages'), ('rosters'), ('coaches'), ('leftovers');