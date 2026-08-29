CREATE TYPE public.intel_field_type AS ENUM (
  'style_of_play','recruiting_philosophy','positions_prioritized','preferred_player_profile',
  'transfer_juco_tendencies','freshman_tendencies','geographic_tendencies','recruiting_timeline',
  'roster_construction_tendencies'
);

CREATE TABLE public.recruiting_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  field_type public.intel_field_type NOT NULL,
  content text,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, field_type)
);
GRANT SELECT ON public.recruiting_intelligence TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recruiting_intelligence TO authenticated;
GRANT ALL ON public.recruiting_intelligence TO service_role;
ALTER TABLE public.recruiting_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiting_intelligence readable by authenticated"
  ON public.recruiting_intelligence FOR SELECT TO authenticated USING (true);
CREATE POLICY "recruiting_intelligence writable by superadmin"
  ON public.recruiting_intelligence FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.program_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  relationship_strength integer CHECK (relationship_strength BETWEEN 1 AND 5),
  primary_contact_staff_id uuid REFERENCES public.users(id),
  last_meaningful_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_relationships TO authenticated;
GRANT ALL ON public.program_relationships TO service_role;
ALTER TABLE public.program_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "program_relationships superadmin only"
  ON public.program_relationships FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TABLE public.interaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES public.program_relationships(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.users(id),
  interaction_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  event_context text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interaction_log TO authenticated;
GRANT ALL ON public.interaction_log TO service_role;
ALTER TABLE public.interaction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interaction_log superadmin only"
  ON public.interaction_log FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TRIGGER recruiting_intelligence_touch BEFORE UPDATE ON public.recruiting_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER program_relationships_touch BEFORE UPDATE ON public.program_relationships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER interaction_log_touch BEFORE UPDATE ON public.interaction_log
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_recruiting_intelligence AFTER INSERT OR UPDATE OR DELETE ON public.recruiting_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_program_relationships AFTER INSERT OR UPDATE OR DELETE ON public.program_relationships
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
CREATE TRIGGER audit_interaction_log AFTER INSERT OR UPDATE OR DELETE ON public.interaction_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

CREATE INDEX IF NOT EXISTS roster_players_program_season_idx
  ON public.roster_players (program_id, season_year);

CREATE OR REPLACE FUNCTION public.program_roster_summary(_program_id uuid)
RETURNS TABLE (season_year integer, roster_size bigint)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT rp.season_year, count(*)::bigint
  FROM public.roster_players rp
  WHERE rp.program_id = _program_id
  GROUP BY rp.season_year
  ORDER BY rp.season_year DESC NULLS LAST
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.program_roster_summary(uuid) TO authenticated, service_role;