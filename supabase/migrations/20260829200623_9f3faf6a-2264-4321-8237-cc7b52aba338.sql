-- 1. Invite codes
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  label text,
  grants_role public.user_type NOT NULL DEFAULT 'org_admin',
  expires_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites superadmin full access" ON public.org_invites
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TRIGGER org_invites_touch BEFORE UPDATE ON public.org_invites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- hash helper
CREATE OR REPLACE FUNCTION public.hash_invite_code(_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT encode(extensions.digest(lower(btrim(_code)), 'sha256'), 'hex');
$$;

-- seed starter code for Power Baseball
INSERT INTO public.org_invites (organization_id, code_hash, label, grants_role)
SELECT id, public.hash_invite_code('POWERBB-2026'), 'Power Baseball staff invite', 'org_admin'
FROM public.organizations WHERE name = 'Power Baseball';

-- 2. Hardened signup: role comes from invite, never from client metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _code text;
  _invite public.org_invites;
  _type public.user_type := 'player';
  _org uuid := NULL;
BEGIN
  _code := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')), '');

  IF _code IS NOT NULL THEN
    SELECT * INTO _invite FROM public.org_invites
     WHERE code_hash = public.hash_invite_code(_code)
       AND is_active
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_uses IS NULL OR uses < max_uses)
     LIMIT 1;

    IF _invite.id IS NOT NULL THEN
      _type := _invite.grants_role;
      _org := _invite.organization_id;
      UPDATE public.org_invites SET uses = uses + 1 WHERE id = _invite.id;
    END IF;
  END IF;

  -- never allow self-granted superadmin
  IF _type = 'superadmin' THEN
    _type := 'org_admin';
  END IF;

  INSERT INTO public.users (id, email, name, user_type, organization_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _type, _org)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _type)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- invite check callable pre-signup (no code disclosure)
CREATE OR REPLACE FUNCTION public.invite_code_valid(_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_invites
     WHERE code_hash = public.hash_invite_code(_code)
       AND is_active
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_uses IS NULL OR uses < max_uses)
  );
$$;
GRANT EXECUTE ON FUNCTION public.invite_code_valid(text) TO anon, authenticated;

-- 3. Data integrity
CREATE UNIQUE INDEX IF NOT EXISTS programs_university_sport_key
  ON public.programs (university_id, sport);

DELETE FROM public.data_field_sources d
 USING public.data_field_sources d2
 WHERE d.table_name = d2.table_name AND d.record_id = d2.record_id
   AND d.field_name = d2.field_name AND d.ctid > d2.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS data_field_sources_record_field_key
  ON public.data_field_sources (table_name, record_id, field_name);

-- 4. Field-level audit triggers
CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _old jsonb;
  _new jsonb;
  _key text;
  _rec_id uuid;
  _o text;
  _n text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new := to_jsonb(NEW);
    _rec_id := NULLIF(_new->>'id', '')::uuid;
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (_actor, TG_TABLE_NAME, _rec_id, NULL, NULL, _new::text, 'create');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD);
    _rec_id := NULLIF(_old->>'id', '')::uuid;
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (_actor, TG_TABLE_NAME, _rec_id, NULL, _old::text, NULL, 'update');
    RETURN OLD;
  ELSE
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _rec_id := NULLIF(_new->>'id', '')::uuid;
    FOR _key IN SELECT jsonb_object_keys(_new) LOOP
      IF _key IN ('updated_at') THEN CONTINUE; END IF;
      _o := _old->>_key;
      _n := _new->>_key;
      IF _o IS DISTINCT FROM _n THEN
        INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
        VALUES (_actor, TG_TABLE_NAME, _rec_id, _key, _o, _n, 'update');
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER audit_universities AFTER INSERT OR UPDATE OR DELETE ON public.universities
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_programs AFTER INSERT OR UPDATE OR DELETE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_majors AFTER INSERT OR UPDATE OR DELETE ON public.majors
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_classifications AFTER INSERT OR UPDATE OR DELETE ON public.classifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_data_field_sources AFTER INSERT OR UPDATE OR DELETE ON public.data_field_sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- university_majors has no id column; log with the university as record
CREATE OR REPLACE FUNCTION public.audit_university_majors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (auth.uid(), 'university_majors', NEW.university_id, 'major_id', NULL, NEW.major_id::text, 'create');
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_log (actor_id, table_name, record_id, field_name, old_value, new_value, action)
    VALUES (auth.uid(), 'university_majors', OLD.university_id, 'major_id', OLD.major_id::text, NULL, 'update');
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER audit_university_majors AFTER INSERT OR DELETE ON public.university_majors
  FOR EACH ROW EXECUTE FUNCTION public.audit_university_majors();