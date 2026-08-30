CREATE TYPE public.pending_change_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.pending_data_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid,
  field_name text,
  proposed_value jsonb NOT NULL,
  source_url text,
  source_type public.source_type NOT NULL DEFAULT 'aggregator',
  ai_confidence numeric,
  status public.pending_change_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_data_changes TO authenticated;
GRANT ALL ON public.pending_data_changes TO service_role;

ALTER TABLE public.pending_data_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage pending data changes"
  ON public.pending_data_changes FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE INDEX pending_data_changes_status_idx ON public.pending_data_changes (status, created_at DESC);
CREATE INDEX pending_data_changes_table_idx ON public.pending_data_changes (table_name);

CREATE TRIGGER pending_data_changes_touch
  BEFORE UPDATE ON public.pending_data_changes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_pending_data_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.pending_data_changes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

CREATE TABLE public.roster_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  season_year integer,
  pulled_at timestamp with time zone NOT NULL DEFAULT now(),
  position_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  class_year_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer_count integer NOT NULL DEFAULT 0,
  juco_transfer_count integer NOT NULL DEFAULT 0,
  source_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.roster_snapshots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.roster_snapshots TO authenticated;
GRANT ALL ON public.roster_snapshots TO service_role;

ALTER TABLE public.roster_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in accounts read roster history"
  ON public.roster_snapshots FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Superadmins write roster history"
  ON public.roster_snapshots FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE INDEX roster_snapshots_program_idx ON public.roster_snapshots (program_id, pulled_at DESC);

CREATE TRIGGER audit_roster_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON public.roster_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();