UPDATE public.universities SET state = 'NY' WHERE state = 'N.Y.';
UPDATE public.universities SET state = 'IL' WHERE state IN ('Ill','Ill.');
UPDATE public.universities SET state = 'TN' WHERE state = 'Tenn.';
UPDATE public.universities SET state = 'BC' WHERE state IS NULL AND name IN ('University of British Columbia','Douglas College');
UPDATE public.universities SET state = upper(trim(state)) WHERE state IS NOT NULL AND state <> upper(trim(state)) AND length(trim(state)) = 2;