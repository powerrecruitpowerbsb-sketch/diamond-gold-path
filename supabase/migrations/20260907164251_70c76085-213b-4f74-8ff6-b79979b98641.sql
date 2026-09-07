CREATE INDEX IF NOT EXISTS pending_data_changes_status_created_idx
  ON public.pending_data_changes (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pending_data_changes_archive (
  id uuid PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid,
  field_name text,
  proposed_value jsonb NOT NULL,
  original_value jsonb,
  source_url text,
  source_type source_type NOT NULL,
  ai_confidence numeric,
  status pending_change_status NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  decided_via text NOT NULL DEFAULT 'manual',
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pending_data_changes_archive TO authenticated;
GRANT ALL ON public.pending_data_changes_archive TO service_role;

ALTER TABLE public.pending_data_changes_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read archived review items"
  ON public.pending_data_changes_archive FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

CREATE INDEX IF NOT EXISTS pending_data_changes_archive_created_idx
  ON public.pending_data_changes_archive (created_at DESC);

WITH moved AS (
  DELETE FROM public.pending_data_changes
  WHERE status <> 'pending'
    AND coalesce(reviewed_at, created_at) < now() - interval '30 days'
  RETURNING *
)
INSERT INTO public.pending_data_changes_archive (
  id, table_name, record_id, field_name, proposed_value, original_value,
  source_url, source_type, ai_confidence, status, reviewed_by, reviewed_at,
  decided_via, review_note, created_at
)
SELECT id, table_name, record_id, field_name, proposed_value, original_value,
       source_url, source_type, ai_confidence, status, reviewed_by, reviewed_at,
       decided_via, review_note, created_at
FROM moved
ON CONFLICT (id) DO NOTHING;