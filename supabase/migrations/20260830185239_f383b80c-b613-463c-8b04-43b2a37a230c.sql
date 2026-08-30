ALTER TYPE public.governing_body ADD VALUE IF NOT EXISTS 'CCCAA';
ALTER TYPE public.governing_body ADD VALUE IF NOT EXISTS 'NWAC';

CREATE TYPE public.url_discovery_type AS ENUM ('athletic_website', 'roster_page', 'coaching_staff_page');
CREATE TYPE public.url_discovery_confidence AS ENUM ('high', 'low', 'failed');
CREATE TYPE public.url_discovery_status AS ENUM ('pending_review', 'confirmed', 'rejected');

CREATE TABLE public.url_discovery_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  discovery_type public.url_discovery_type NOT NULL,
  discovered_url text,
  confidence public.url_discovery_confidence NOT NULL DEFAULT 'low',
  status public.url_discovery_status NOT NULL DEFAULT 'pending_review',
  notes text,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX url_discovery_queue_status_idx
  ON public.url_discovery_queue (status, confidence, created_at DESC);
CREATE INDEX url_discovery_queue_university_idx
  ON public.url_discovery_queue (university_id);

-- One open proposal per school/program/link-kind, so re-running discovery
-- refreshes the row instead of stacking duplicates in the queue.
CREATE UNIQUE INDEX url_discovery_queue_unique_pending
  ON public.url_discovery_queue (university_id, discovery_type, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending_review';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.url_discovery_queue TO authenticated;
GRANT ALL ON public.url_discovery_queue TO service_role;

ALTER TABLE public.url_discovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage discovered urls"
  ON public.url_discovery_queue
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TRIGGER url_discovery_queue_touch
  BEFORE UPDATE ON public.url_discovery_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_url_discovery_queue
  AFTER INSERT OR DELETE OR UPDATE ON public.url_discovery_queue
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();