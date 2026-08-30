GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_data_changes TO authenticated;
GRANT ALL ON public.pending_data_changes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_snapshots TO authenticated;
GRANT ALL ON public.roster_snapshots TO service_role;