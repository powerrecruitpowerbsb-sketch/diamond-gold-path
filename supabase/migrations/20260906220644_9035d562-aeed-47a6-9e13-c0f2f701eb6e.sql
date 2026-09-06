-- 1. Accuracy spot checks could be read but never written, so every sample failed.
GRANT INSERT ON public.accuracy_checks TO authenticated;
GRANT ALL ON public.accuracy_checks TO service_role;

CREATE POLICY "Superadmins record accuracy checks"
  ON public.accuracy_checks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

-- 2. Keep the school's own season wording next to the canonical season number.
ALTER TABLE public.roster_players
  ADD COLUMN IF NOT EXISTS season_label text;