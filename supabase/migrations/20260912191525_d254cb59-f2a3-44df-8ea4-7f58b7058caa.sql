DROP INDEX IF EXISTS public.majors_cip_code_key;
ALTER TABLE public.majors ADD CONSTRAINT majors_cip_code_key UNIQUE (cip_code);