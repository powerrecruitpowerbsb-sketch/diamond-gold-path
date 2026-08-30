ALTER TABLE public.pending_data_changes
  ADD COLUMN IF NOT EXISTS decided_via text NOT NULL DEFAULT 'human';

-- Collapse existing duplicate pending field proposals, keeping the highest-confidence row.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY table_name, record_id, field_name
           ORDER BY COALESCE(ai_confidence, -1) DESC, created_at DESC
         ) AS rn
  FROM public.pending_data_changes
  WHERE status = 'pending' AND field_name IS NOT NULL AND record_id IS NOT NULL
)
DELETE FROM public.pending_data_changes p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pending_data_changes_unique_pending_field
  ON public.pending_data_changes (table_name, record_id, field_name)
  WHERE status = 'pending' AND field_name IS NOT NULL AND record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pending_data_changes_unique_pending_record
  ON public.pending_data_changes (table_name, record_id)
  WHERE status = 'pending' AND field_name IS NULL AND record_id IS NOT NULL;