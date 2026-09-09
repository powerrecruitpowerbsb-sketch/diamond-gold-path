-- STEP 2A
CREATE OR REPLACE FUNCTION public.link_key(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      split_part(split_part(public.link_host(_url), '#', 1), '?', 1),
      '/+$', ''
    ),
    ''
  )
$$;

ALTER TABLE public.federal_directory
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS two_year boolean;

ALTER TABLE public.url_discovery_queue
  ADD COLUMN IF NOT EXISTS match_evidence jsonb;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS link_evidence jsonb;

CREATE OR REPLACE FUNCTION public.guard_program_link_collisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  host text;
  key text;
  holder record;
BEGIN
  IF NEW.athletic_website IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.athletic_website IS DISTINCT FROM OLD.athletic_website) THEN
    host := public.link_host_only(NEW.athletic_website);
    IF host IS NOT NULL AND NOT public.is_platform_host(host) THEN
      SELECT p.id, p.university_id INTO holder
      FROM public.programs p
      WHERE p.university_id <> NEW.university_id
        AND public.link_host_only(p.athletic_website) = host
      LIMIT 1;
      IF holder.id IS NOT NULL THEN
        INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
          normalized_key, holder_program_id, holder_university_id, detail)
        VALUES (CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END, NEW.university_id,
          'athletic_website', NEW.athletic_website, host, holder.id, holder.university_id,
          'This athletics domain is already attached to another school.');
        NEW.athletic_website := CASE WHEN TG_OP = 'UPDATE' THEN OLD.athletic_website ELSE NULL END;
      END IF;
    END IF;
  END IF;

  IF NEW.roster_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.roster_url IS DISTINCT FROM OLD.roster_url) THEN
    key := public.link_key(NEW.roster_url);
    IF key IS NOT NULL THEN
      SELECT p.id, p.university_id INTO holder
      FROM public.programs p
      WHERE p.university_id <> NEW.university_id
        AND public.link_key(p.roster_url) = key
      LIMIT 1;
      IF holder.id IS NOT NULL THEN
        INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
          normalized_key, holder_program_id, holder_university_id, detail)
        VALUES (CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END, NEW.university_id,
          'roster_url', NEW.roster_url, key, holder.id, holder.university_id,
          'This exact roster page is already attached to another school.');
        NEW.roster_url := CASE WHEN TG_OP = 'UPDATE' THEN OLD.roster_url ELSE NULL END;
      END IF;
    END IF;
  END IF;

  IF NEW.coaching_staff_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.coaching_staff_url IS DISTINCT FROM OLD.coaching_staff_url) THEN
    key := public.link_key(NEW.coaching_staff_url);
    IF key IS NOT NULL THEN
      SELECT p.id, p.university_id INTO holder
      FROM public.programs p
      WHERE p.university_id <> NEW.university_id
        AND public.link_key(p.coaching_staff_url) = key
      LIMIT 1;
      IF holder.id IS NOT NULL THEN
        INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
          normalized_key, holder_program_id, holder_university_id, detail)
        VALUES (CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END, NEW.university_id,
          'coaching_staff_url', NEW.coaching_staff_url, key, holder.id, holder.university_id,
          'This exact staff page is already attached to another school.');
        NEW.coaching_staff_url := CASE WHEN TG_OP = 'UPDATE' THEN OLD.coaching_staff_url ELSE NULL END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_university_website_collisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  host text;
  holder_university uuid;
  holder_program uuid;
BEGIN
  IF NEW.website_url IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.website_url IS NOT DISTINCT FROM OLD.website_url THEN RETURN NEW; END IF;

  host := public.link_host_only(NEW.website_url);
  IF host IS NULL OR public.is_platform_host(host) THEN RETURN NEW; END IF;

  SELECT u.id INTO holder_university
  FROM public.universities u
  WHERE u.id <> NEW.id AND public.link_host_only(u.website_url) = host
  LIMIT 1;

  IF holder_university IS NULL THEN
    SELECT p.id, p.university_id INTO holder_program, holder_university
    FROM public.programs p
    WHERE p.university_id <> NEW.id
      AND public.link_host_only(p.athletic_website) = host
    LIMIT 1;
  END IF;

  IF holder_university IS NOT NULL THEN
    INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
      normalized_key, holder_program_id, holder_university_id, detail)
    VALUES (NULL, NEW.id, 'website_url', NEW.website_url, host, holder_program, holder_university,
      'This domain is already attached to another school.');
    NEW.website_url := CASE WHEN TG_OP = 'UPDATE' THEN OLD.website_url ELSE NULL END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS universities_website_collision_guard ON public.universities;
CREATE TRIGGER universities_website_collision_guard
  BEFORE INSERT OR UPDATE ON public.universities
  FOR EACH ROW EXECUTE FUNCTION public.guard_university_website_collisions();

DROP INDEX IF EXISTS public.programs_roster_key_idx;
DROP INDEX IF EXISTS public.programs_staff_key_idx;
CREATE INDEX IF NOT EXISTS programs_roster_link_key_idx ON public.programs (public.link_key(roster_url));
CREATE INDEX IF NOT EXISTS programs_staff_link_key_idx ON public.programs (public.link_key(coaching_staff_url));
CREATE INDEX IF NOT EXISTS universities_website_host_idx ON public.universities (public.link_host_only(website_url));