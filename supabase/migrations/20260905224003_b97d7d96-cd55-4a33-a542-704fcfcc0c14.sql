CREATE TABLE public.collection_state (
  id text NOT NULL PRIMARY KEY DEFAULT 'singleton',
  is_running boolean NOT NULL DEFAULT false,
  stop_requested boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  last_beat_at timestamptz,
  links_found integer NOT NULL DEFAULT 0,
  links_applied integer NOT NULL DEFAULT 0,
  programs_scraped integer NOT NULL DEFAULT 0,
  players_found integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  last_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_state_singleton CHECK (id = 'singleton')
);

GRANT SELECT, INSERT, UPDATE ON public.collection_state TO authenticated;
GRANT ALL ON public.collection_state TO service_role;

ALTER TABLE public.collection_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage collection state"
  ON public.collection_state FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TRIGGER collection_state_touch
  BEFORE UPDATE ON public.collection_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.collection_state (id) VALUES ('singleton');