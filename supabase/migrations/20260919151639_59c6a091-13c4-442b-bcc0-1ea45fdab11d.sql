-- ============ 1. CONTINUUM STAGES ============
CREATE TABLE public.continuum_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  maps_to public.saved_school_status NOT NULL DEFAULT 'researching',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.continuum_stages TO authenticated;
GRANT ALL ON public.continuum_stages TO service_role;
ALTER TABLE public.continuum_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stages superadmin full access" ON public.continuum_stages
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "stages readable inside the organization" ON public.continuum_stages
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());

CREATE POLICY "stages managed by admin level" ON public.continuum_stages
  FOR ALL TO authenticated
  USING (public.is_org_admin_level() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_admin_level() AND organization_id = public.current_org_id());

CREATE TRIGGER continuum_stages_touch BEFORE UPDATE ON public.continuum_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_continuum_stages AFTER INSERT OR UPDATE OR DELETE ON public.continuum_stages
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- seed the five defaults for every organization on file
INSERT INTO public.continuum_stages (organization_id, name, sort_order, maps_to, is_default)
SELECT o.id, d.name, d.ord, d.maps_to, true
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('Researching', 1, 'researching'::public.saved_school_status),
    ('Contacted',   2, 'contacted'::public.saved_school_status),
    ('Offered',     3, 'offered'::public.saved_school_status),
    ('Committed',   4, 'committed'::public.saved_school_status),
    ('Eliminated',  5, 'eliminated'::public.saved_school_status)
  ) AS d(name, ord, maps_to)
ON CONFLICT (organization_id, name) DO NOTHING;

-- seed defaults for every organization created from here on
CREATE OR REPLACE FUNCTION public.seed_continuum_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.continuum_stages (organization_id, name, sort_order, maps_to, is_default)
  VALUES
    (NEW.id, 'Researching', 1, 'researching', true),
    (NEW.id, 'Contacted',   2, 'contacted',   true),
    (NEW.id, 'Offered',     3, 'offered',     true),
    (NEW.id, 'Committed',   4, 'committed',   true),
    (NEW.id, 'Eliminated',  5, 'eliminated',  true)
  ON CONFLICT (organization_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_continuum_stages() FROM PUBLIC, anon;

CREATE TRIGGER organizations_seed_stages AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_continuum_stages();

-- ============ 2. SAVED SCHOOLS -> STAGE ============
ALTER TABLE public.athlete_saved_schools
  ADD COLUMN org_stage_id uuid REFERENCES public.continuum_stages(id) ON DELETE SET NULL;

UPDATE public.athlete_saved_schools s
   SET org_stage_id = cs.id
  FROM public.org_athletes a
  JOIN public.continuum_stages cs ON cs.organization_id = a.organization_id
 WHERE a.id = s.org_athlete_id
   AND cs.maps_to = s.status
   AND cs.is_default
   AND s.org_stage_id IS NULL;

-- keep the legacy status column in step with the chosen stage
CREATE OR REPLACE FUNCTION public.sync_saved_school_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped public.saved_school_status;
  org uuid;
BEGIN
  IF NEW.org_stage_id IS NOT NULL THEN
    SELECT cs.maps_to, cs.organization_id INTO mapped, org
      FROM public.continuum_stages cs WHERE cs.id = NEW.org_stage_id;
    IF mapped IS NULL THEN
      RAISE EXCEPTION 'That stage does not exist';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.org_athletes a
       WHERE a.id = NEW.org_athlete_id AND a.organization_id = org
    ) THEN
      RAISE EXCEPTION 'That stage belongs to a different organization';
    END IF;
    NEW.status := mapped;
  ELSE
    SELECT cs.id INTO NEW.org_stage_id
      FROM public.continuum_stages cs
      JOIN public.org_athletes a ON a.organization_id = cs.organization_id
     WHERE a.id = NEW.org_athlete_id AND cs.is_default AND cs.maps_to = NEW.status
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_saved_school_stage() FROM PUBLIC, anon;

CREATE TRIGGER athlete_saved_schools_stage_sync
  BEFORE INSERT OR UPDATE ON public.athlete_saved_schools
  FOR EACH ROW EXECUTE FUNCTION public.sync_saved_school_stage();

-- ============ 3. THE FAMILY / PLAYER WRITE PATH ============
CREATE OR REPLACE FUNCTION public.is_own_athlete(_athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_family_links l
     WHERE l.org_athlete_id = _athlete_id AND l.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid() AND u.linked_org_athlete_id = _athlete_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_own_athlete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_athlete(uuid) TO authenticated, service_role;

CREATE POLICY "families read their athlete's list" ON public.athlete_saved_schools
  FOR SELECT TO authenticated USING (public.is_own_athlete(org_athlete_id));

CREATE POLICY "families move their athlete's schools" ON public.athlete_saved_schools
  FOR UPDATE TO authenticated
  USING (public.is_own_athlete(org_athlete_id))
  WITH CHECK (public.is_own_athlete(org_athlete_id));

CREATE POLICY "families add to their athlete's list" ON public.athlete_saved_schools
  FOR INSERT TO authenticated WITH CHECK (public.is_own_athlete(org_athlete_id));

-- ============ 4. MESSAGING ============
CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  subject text,
  created_by uuid REFERENCES public.users(id),
  is_closed boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_athlete_id, program_id)
);

CREATE TABLE public.thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_role public.user_type NOT NULL,
  removable boolean NOT NULL DEFAULT true,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id),
  body text NOT NULL,
  body_original text,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES public.users(id),
  reason text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_thread_created_idx ON public.messages (thread_id, created_at);
CREATE INDEX thread_participants_user_idx ON public.thread_participants (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.message_reports TO authenticated;
GRANT ALL ON public.message_threads TO service_role;
GRANT ALL ON public.thread_participants TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.message_reports TO service_role;

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.in_thread(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thread_participants p
     WHERE p.thread_id = _thread_id AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.in_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_thread(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_see_thread(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
      OR public.in_thread(_thread_id)
      OR EXISTS (
        SELECT 1 FROM public.message_threads t
         WHERE t.id = _thread_id AND public.can_access_athlete(t.org_athlete_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.message_threads t
         WHERE t.id = _thread_id AND public.is_own_athlete(t.org_athlete_id)
      );
$$;
REVOKE ALL ON FUNCTION public.can_see_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_thread(uuid) TO authenticated, service_role;

CREATE POLICY "threads visible to people on them" ON public.message_threads
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.in_thread(id)
    OR public.can_access_athlete(org_athlete_id)
    OR public.is_own_athlete(org_athlete_id)
  );

CREATE POLICY "threads created inside the organization" ON public.message_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR public.can_access_athlete(org_athlete_id)
    OR public.is_own_athlete(org_athlete_id)
  );

CREATE POLICY "threads updated by staff or superadmin" ON public.message_threads
  FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR public.can_access_athlete(org_athlete_id))
  WITH CHECK (public.is_superadmin() OR public.can_access_athlete(org_athlete_id));

CREATE POLICY "participants visible with the thread" ON public.thread_participants
  FOR SELECT TO authenticated USING (public.can_see_thread(thread_id));

CREATE POLICY "participants added with the thread" ON public.thread_participants
  FOR INSERT TO authenticated WITH CHECK (public.can_see_thread(thread_id));

CREATE POLICY "participants update their own row" ON public.thread_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin())
  WITH CHECK (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY "parents are never removed" ON public.thread_participants
  FOR DELETE TO authenticated
  USING (removable AND (public.is_superadmin() OR public.can_see_thread(thread_id)));

CREATE POLICY "messages visible with the thread" ON public.messages
  FOR SELECT TO authenticated USING (public.can_see_thread(thread_id));

CREATE POLICY "messages written by people on the thread" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.can_see_thread(thread_id));

CREATE POLICY "authors may correct their own message" ON public.messages
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "reports written by people on the thread" ON public.message_reports
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid() AND public.can_see_thread(thread_id));

CREATE POLICY "reports read by superadmin" ON public.message_reports
  FOR SELECT TO authenticated USING (public.is_superadmin() OR reported_by = auth.uid());

CREATE POLICY "reports worked by superadmin" ON public.message_reports
  FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TRIGGER message_threads_touch BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER message_reports_touch BEFORE UPDATE ON public.message_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_message_threads AFTER INSERT OR UPDATE OR DELETE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- a message keeps its original text and stamps the thread
CREATE OR REPLACE FUNCTION public.message_written()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.message_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
    RETURN NEW;
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.body_original := COALESCE(OLD.body_original, OLD.body);
    NEW.edited_at := now();
  END IF;
  NEW.thread_id := OLD.thread_id;
  NEW.author_user_id := OLD.author_user_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.message_written() FROM PUBLIC, anon;

CREATE TRIGGER messages_edit_guard BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.message_written();
CREATE TRIGGER messages_stamp_thread AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.message_written();