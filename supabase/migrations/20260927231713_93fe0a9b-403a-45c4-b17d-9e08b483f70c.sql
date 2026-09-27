CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _invite public.org_invites;
  _member public.org_member_invites;
  _type public.user_type := 'player';
  _org uuid := NULL;
  _athlete uuid := NULL;
BEGIN
  SELECT * INTO _member FROM public.org_member_invites
   WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF _member.id IS NOT NULL THEN
    _type := _member.invited_role;
    _org := _member.organization_id;
    _athlete := _member.org_athlete_id;
  ELSE
    _code := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')), '');
    IF _code IS NOT NULL THEN
      SELECT * INTO _invite FROM public.org_invites
       WHERE code_hash = public.hash_invite_code(_code) AND is_active
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

  IF _type = 'superadmin' THEN _type := 'org_admin'; END IF;

  INSERT INTO public.users (id, email, name, user_type, organization_id, linked_org_athlete_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _type, _org, _athlete)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _type)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _member.id IS NOT NULL THEN
    -- Account exists now, but the invite stays "sent" until the person sets a password.
    UPDATE public.org_member_invites SET accepted_user_id = NEW.id WHERE id = _member.id;

    IF _athlete IS NOT NULL THEN
      INSERT INTO public.athlete_family_links (org_athlete_id, user_id, relationship)
      VALUES (_athlete, NEW.id, _type)
      ON CONFLICT (org_athlete_id, user_id) DO NOTHING;
      UPDATE public.org_athletes SET linked_parent_user_id = NEW.id
       WHERE id = _athlete AND linked_parent_user_id IS NULL AND _type = 'parent';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Called by the signed-in user right after they set their password.
CREATE OR REPLACE FUNCTION public.complete_my_invites()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n integer; _email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  UPDATE public.org_member_invites
     SET status = 'accepted', accepted_user_id = auth.uid(), accepted_at = now()
   WHERE status = 'pending'
     AND (accepted_user_id = auth.uid() OR lower(email) = lower(_email));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_my_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_invites() TO authenticated;

-- Invites marked accepted by the old trigger for people who never set a password go back to "sent".
UPDATE public.org_member_invites i SET status = 'pending', accepted_at = NULL
  FROM auth.users u
 WHERE i.status = 'accepted' AND i.accepted_user_id = u.id
   AND (u.encrypted_password IS NULL OR u.encrypted_password = '');