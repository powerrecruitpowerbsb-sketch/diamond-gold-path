-- ============ org_member_invites ============
CREATE TABLE public.org_member_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_role public.user_type NOT NULL,
  org_athlete_id uuid REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES public.users(id),
  accepted_user_id uuid REFERENCES public.users(id),
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT org_member_invites_role_allowed
    CHECK (invited_role IN ('org_admin'::public.user_type, 'org_staff'::public.user_type, 'parent'::public.user_type, 'player'::public.user_type)),
  CONSTRAINT org_member_invites_status_allowed
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT org_member_invites_family_needs_athlete
    CHECK (
      (invited_role IN ('parent'::public.user_type, 'player'::public.user_type) AND org_athlete_id IS NOT NULL)
      OR (invited_role IN ('org_admin'::public.user_type, 'org_staff'::public.user_type) AND org_athlete_id IS NULL)
    )
);

CREATE UNIQUE INDEX org_member_invites_pending_unique
  ON public.org_member_invites (organization_id, lower(email), COALESCE(org_athlete_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';

CREATE INDEX org_member_invites_email_pending_idx
  ON public.org_member_invites (lower(email)) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_member_invites TO authenticated;
GRANT ALL ON public.org_member_invites TO service_role;

ALTER TABLE public.org_member_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all invites"
  ON public.org_member_invites FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Org managers read their invites"
  ON public.org_member_invites FOR SELECT TO authenticated
  USING (public.is_org_manager() AND organization_id = public.current_org_id());

CREATE POLICY "Org managers create their invites"
  ON public.org_member_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_org_manager() AND organization_id = public.current_org_id());

CREATE POLICY "Org managers update their invites"
  ON public.org_member_invites FOR UPDATE TO authenticated
  USING (public.is_org_manager() AND organization_id = public.current_org_id())
  WITH CHECK (public.is_org_manager() AND organization_id = public.current_org_id());

CREATE TRIGGER org_member_invites_touch
  BEFORE UPDATE ON public.org_member_invites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_org_member_invites
  AFTER INSERT OR UPDATE OR DELETE ON public.org_member_invites
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- ============ athlete_family_links ============
CREATE TABLE public.athlete_family_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship public.user_type NOT NULL DEFAULT 'parent'::public.user_type,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT athlete_family_links_relationship_allowed
    CHECK (relationship IN ('parent'::public.user_type, 'player'::public.user_type)),
  CONSTRAINT athlete_family_links_unique UNIQUE (org_athlete_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_family_links TO authenticated;
GRANT ALL ON public.athlete_family_links TO service_role;

ALTER TABLE public.athlete_family_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all family links"
  ON public.athlete_family_links FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "Org managers manage their family links"
  ON public.athlete_family_links FOR ALL TO authenticated
  USING (
    public.is_org_manager() AND EXISTS (
      SELECT 1 FROM public.org_athletes a
      WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()
    )
  )
  WITH CHECK (
    public.is_org_manager() AND EXISTS (
      SELECT 1 FROM public.org_athletes a
      WHERE a.id = org_athlete_id AND a.organization_id = public.current_org_id()
    )
  );

CREATE POLICY "Family members read their own links"
  ON public.athlete_family_links FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ helper: is this athlete linked to me? ============
CREATE OR REPLACE FUNCTION public.is_linked_athlete(_athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_family_links
    WHERE org_athlete_id = _athlete_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_linked_athlete(uuid) TO authenticated;

-- ============ family read access ============
CREATE POLICY "Family members read their linked athlete"
  ON public.org_athletes FOR SELECT TO authenticated
  USING (public.is_linked_athlete(id));

CREATE POLICY "Family members read their athlete's saved schools"
  ON public.athlete_saved_schools FOR SELECT TO authenticated
  USING (public.is_linked_athlete(org_athlete_id));

CREATE POLICY "Family members read shared notes"
  ON public.org_player_notes FOR SELECT TO authenticated
  USING (visible_to_parent AND public.is_linked_athlete(org_athlete_id));

-- ============ acceptance: apply invite on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _invite public.org_invites;
  _member public.org_member_invites;
  _type public.user_type := 'player';
  _org uuid := NULL;
  _athlete uuid := NULL;
BEGIN
  -- 1. Direct email invite (staff or family) matched on the invited address.
  SELECT * INTO _member FROM public.org_member_invites
   WHERE lower(email) = lower(NEW.email)
     AND status = 'pending'
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF _member.id IS NOT NULL THEN
    _type := _member.invited_role;
    _org := _member.organization_id;
    _athlete := _member.org_athlete_id;
  ELSE
    -- 2. Shared organization invite code path.
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
  END IF;

  -- never allow self-granted superadmin
  IF _type = 'superadmin' THEN
    _type := 'org_admin';
  END IF;

  INSERT INTO public.users (id, email, name, user_type, organization_id, linked_org_athlete_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _type, _org, _athlete)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _type)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _member.id IS NOT NULL THEN
    UPDATE public.org_member_invites
       SET status = 'accepted', accepted_user_id = NEW.id, accepted_at = now()
     WHERE id = _member.id;

    IF _athlete IS NOT NULL THEN
      INSERT INTO public.athlete_family_links (org_athlete_id, user_id, relationship)
      VALUES (_athlete, NEW.id, _type)
      ON CONFLICT (org_athlete_id, user_id) DO NOTHING;

      UPDATE public.org_athletes
         SET linked_parent_user_id = NEW.id
       WHERE id = _athlete AND linked_parent_user_id IS NULL AND _type = 'parent';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;