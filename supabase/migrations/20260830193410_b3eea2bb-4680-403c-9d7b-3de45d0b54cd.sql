ALTER TABLE public.universities DROP CONSTRAINT IF EXISTS universities_federal_match_status_check;
ALTER TABLE public.universities
  ADD CONSTRAINT universities_federal_match_status_check
  CHECK (federal_match_status = ANY (ARRAY['unmatched'::text, 'confirmed'::text, 'ambiguous'::text, 'manual'::text]));
UPDATE public.universities SET federal_match_status = 'confirmed' WHERE federal_match_status = 'matched';
UPDATE public.universities SET federal_match_status = 'unmatched' WHERE federal_match_status = 'not_found';