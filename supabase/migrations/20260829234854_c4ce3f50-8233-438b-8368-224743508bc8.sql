-- 1. Enums
CREATE TYPE public.athlete_status AS ENUM ('active','graduated','departed');

-- 2. seasons
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE UNIQUE INDEX seasons_one_active_per_org ON public.seasons (organization_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

-- 3. teams
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_group text,
  head_coach_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 4. team_coaches
CREATE TABLE public.team_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'coach',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_coaches TO authenticated;
GRANT ALL ON public.team_coaches TO service_role;
ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;

-- 5. team_athletes
CREATE TABLE public.team_athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  org_athlete_id uuid NOT NULL REFERENCES public.org_athletes(id) ON DELETE CASCADE,
  jersey_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, org_athlete_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_athletes TO authenticated;
GRANT ALL ON public.team_athletes TO service_role;
ALTER TABLE public.team_athletes ENABLE ROW LEVEL SECURITY;

-- 6. New columns
ALTER TABLE public.org_athletes ADD COLUMN status public.athlete_status NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN org_wide_access boolean NOT NULL DEFAULT false;

-- 7. Helper functions
CREATE OR REPLACE FUNCTION public.active_season_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM public.seasons s
   WHERE s.organization_id = public.current_org_id() AND s.is_active
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_org_wide_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT u.org_wide_access FROM public.users u WHERE u.id = auth.uid()), false)
      OR public.has_role(auth.uid(), 'org_admin'::public.user_type);
$$;

CREATE OR REPLACE FUNCTION public.coaches_team(_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_coaches tc
     WHERE tc.team_id = _team_id AND tc.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
     WHERE t.id = _team_id AND t.head_coach_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_athlete(_athlete_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin()
      OR (
        public.is_org_manager()
        AND EXISTS (
          SELECT 1 FROM public.org_athletes a
           WHERE a.id = _athlete_id
             AND a.organization_id IS NOT NULL
             AND a.organization_id = public.current_org_id()
        )
        AND (
          public.has_org_wide_access()
          OR EXISTS (
            SELECT 1
              FROM public.team_athletes ta
              JOIN public.teams t ON t.id = ta.team_id
             WHERE ta.org_athlete_id = _athlete_id
               AND (
                 t.head_coach_user_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.team_coaches tc WHERE tc.team_id = t.id AND tc.user_id = auth.uid())
               )
          )
        )
      );
$$;

GRANT EXECUTE ON FUNCTION public.active_season_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_wide_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.coaches_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_athlete(uuid) TO authenticated;

-- 8. RLS policies for the new tables
CREATE POLICY "seasons superadmin full access" ON public.seasons FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "seasons org read" ON public.seasons FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "seasons org admin manage" ON public.seasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND organization_id = public.current_org_id())
  WITH CHECK (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND organization_id = public.current_org_id());

CREATE POLICY "teams superadmin full access" ON public.teams FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "teams org read" ON public.teams FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "teams org admin manage" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND organization_id = public.current_org_id())
  WITH CHECK (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND organization_id = public.current_org_id());

CREATE POLICY "team_coaches superadmin full access" ON public.team_coaches FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "team_coaches org read" ON public.team_coaches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_coaches.team_id AND t.organization_id = public.current_org_id()));
CREATE POLICY "team_coaches org admin manage" ON public.team_coaches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_coaches.team_id AND t.organization_id = public.current_org_id()))
  WITH CHECK (public.has_role(auth.uid(), 'org_admin'::public.user_type) AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_coaches.team_id AND t.organization_id = public.current_org_id()));

CREATE POLICY "team_athletes superadmin full access" ON public.team_athletes FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "team_athletes family read" ON public.team_athletes FOR SELECT TO authenticated
  USING (public.is_linked_athlete(org_athlete_id));
CREATE POLICY "team_athletes org read" ON public.team_athletes FOR SELECT TO authenticated
  USING (public.is_org_manager() AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_athletes.team_id AND t.organization_id = public.current_org_id()));
CREATE POLICY "team_athletes org manage" ON public.team_athletes FOR ALL TO authenticated
  USING (public.is_org_manager() AND (public.has_org_wide_access() OR public.coaches_team(team_id)) AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_athletes.team_id AND t.organization_id = public.current_org_id()))
  WITH CHECK (public.is_org_manager() AND (public.has_org_wide_access() OR public.coaches_team(team_id)) AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_athletes.team_id AND t.organization_id = public.current_org_id()));

-- 9. Rewrite athlete-scoped policies to respect team assignment
DROP POLICY "org_athletes org managers scoped" ON public.org_athletes;
CREATE POLICY "org_athletes org managers scoped" ON public.org_athletes FOR ALL TO authenticated
  USING (
    public.is_org_manager()
    AND organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND (
      public.has_org_wide_access()
      OR public.can_access_athlete(id)
      OR NOT EXISTS (SELECT 1 FROM public.team_athletes ta WHERE ta.org_athlete_id = org_athletes.id)
    )
  )
  WITH CHECK (
    public.is_org_manager()
    AND organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
  );

DROP POLICY "athlete_saved_schools org managers scoped" ON public.athlete_saved_schools;
CREATE POLICY "athlete_saved_schools org managers scoped" ON public.athlete_saved_schools FOR ALL TO authenticated
  USING (public.can_access_athlete(org_athlete_id) OR (public.is_org_manager() AND public.has_org_wide_access() AND EXISTS (SELECT 1 FROM public.org_athletes a WHERE a.id = athlete_saved_schools.org_athlete_id AND a.organization_id = public.current_org_id())))
  WITH CHECK (public.can_access_athlete(org_athlete_id) OR (public.is_org_manager() AND public.has_org_wide_access() AND EXISTS (SELECT 1 FROM public.org_athletes a WHERE a.id = athlete_saved_schools.org_athlete_id AND a.organization_id = public.current_org_id())));

DROP POLICY "org_player_notes org managers scoped" ON public.org_player_notes;
CREATE POLICY "org_player_notes org managers scoped" ON public.org_player_notes FOR ALL TO authenticated
  USING (public.can_access_athlete(org_athlete_id) OR (public.is_org_manager() AND public.has_org_wide_access() AND EXISTS (SELECT 1 FROM public.org_athletes a WHERE a.id = org_player_notes.org_athlete_id AND a.organization_id = public.current_org_id())))
  WITH CHECK (public.can_access_athlete(org_athlete_id) OR (public.is_org_manager() AND public.has_org_wide_access() AND EXISTS (SELECT 1 FROM public.org_athletes a WHERE a.id = org_player_notes.org_athlete_id AND a.organization_id = public.current_org_id())));

-- 10. Timestamps + audit triggers
CREATE TRIGGER seasons_touch BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER teams_touch BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER team_athletes_touch BEFORE UPDATE ON public.team_athletes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_seasons AFTER INSERT OR UPDATE OR DELETE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_teams AFTER INSERT OR UPDATE OR DELETE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_team_coaches AFTER INSERT OR UPDATE OR DELETE ON public.team_coaches FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_team_athletes AFTER INSERT OR UPDATE OR DELETE ON public.team_athletes FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();