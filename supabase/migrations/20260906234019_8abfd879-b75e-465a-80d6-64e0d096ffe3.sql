ALTER TABLE public.collection_state
  ADD COLUMN IF NOT EXISTS current_wave text,
  ADD COLUMN IF NOT EXISTS auto_advance boolean NOT NULL DEFAULT true;