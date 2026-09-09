-- Normalized host of a URL: lowercase, no scheme, no "www."
CREATE OR REPLACE FUNCTION public.link_host(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(coalesce(_url, '')), '^[a-z]+://', ''),
      '^www\.', ''
    ),
    ''
  ) FROM (SELECT 1) s
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.link_host_only(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(split_part(split_part(public.link_host(_url), '/', 1), '?', 1), ':', 1), '')
$$;

-- Hosting platforms serve many schools from one domain: never a collision.
CREATE TABLE IF NOT EXISTS public.link_platform_hosts (
  host text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.link_platform_hosts TO authenticated;
GRANT ALL ON public.link_platform_hosts TO service_role;
ALTER TABLE public.link_platform_hosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read platform hosts" ON public.link_platform_hosts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmins manage platform hosts" ON public.link_platform_hosts
  FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

INSERT INTO public.link_platform_hosts (host, note) VALUES
  ('prestosports.com', 'Hosting platform'),
  ('sidearmsports.com', 'Hosting platform'),
  ('sidearmsports.net', 'Hosting platform'),
  ('presto-sports.com', 'Hosting platform'),
  ('sportspilot.com', 'Hosting platform'),
  ('streamlinesites.com', 'Hosting platform')
ON CONFLICT (host) DO NOTHING;

-- Refused link values land here for a person to sort out.
CREATE TABLE IF NOT EXISTS public.link_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  field text NOT NULL,
  attempted_url text NOT NULL,
  normalized_key text NOT NULL,
  holder_program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  holder_university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_conflicts_status_idx ON public.link_conflicts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS link_conflicts_key_idx ON public.link_conflicts(normalized_key);

GRANT SELECT, INSERT, UPDATE ON public.link_conflicts TO authenticated;
GRANT ALL ON public.link_conflicts TO service_role;
ALTER TABLE public.link_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins read link conflicts" ON public.link_conflicts
  FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY "Superadmins resolve link conflicts" ON public.link_conflicts
  FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE TRIGGER link_conflicts_touch BEFORE UPDATE ON public.link_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Is this host shared widely enough to be a hosting platform rather than one school's site?
CREATE OR REPLACE FUNCTION public.is_platform_host(_host text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  schools integer;
BEGIN
  IF _host IS NULL THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.link_platform_hosts p
    WHERE _host = p.host OR _host LIKE '%.' || p.host
  ) THEN
    RETURN true;
  END IF;
  SELECT count(DISTINCT university_id) INTO schools
  FROM public.programs
  WHERE public.link_host_only(athletic_website) = _host;
  RETURN coalesce(schools, 0) >= 5;
END;
$$;

-- A team website or page address may belong to only one institution.
CREATE OR REPLACE FUNCTION public.guard_program_link_collisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  host text;
  holder record;
BEGIN
  -- Athletics site: one domain, one institution.
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

  -- Roster page: exact address, one institution.
  IF NEW.roster_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.roster_url IS DISTINCT FROM OLD.roster_url) THEN
    SELECT p.id, p.university_id INTO holder
    FROM public.programs p
    WHERE p.university_id <> NEW.university_id
      AND public.link_host(p.roster_url) = public.link_host(NEW.roster_url)
    LIMIT 1;
    IF holder.id IS NOT NULL THEN
      INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
        normalized_key, holder_program_id, holder_university_id, detail)
      VALUES (CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END, NEW.university_id,
        'roster_url', NEW.roster_url, public.link_host(NEW.roster_url), holder.id, holder.university_id,
        'This roster page is already attached to another school.');
      NEW.roster_url := CASE WHEN TG_OP = 'UPDATE' THEN OLD.roster_url ELSE NULL END;
    END IF;
  END IF;

  -- Staff page: exact address, one institution.
  IF NEW.coaching_staff_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.coaching_staff_url IS DISTINCT FROM OLD.coaching_staff_url) THEN
    SELECT p.id, p.university_id INTO holder
    FROM public.programs p
    WHERE p.university_id <> NEW.university_id
      AND public.link_host(p.coaching_staff_url) = public.link_host(NEW.coaching_staff_url)
    LIMIT 1;
    IF holder.id IS NOT NULL THEN
      INSERT INTO public.link_conflicts (program_id, university_id, field, attempted_url,
        normalized_key, holder_program_id, holder_university_id, detail)
      VALUES (CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END, NEW.university_id,
        'coaching_staff_url', NEW.coaching_staff_url, public.link_host(NEW.coaching_staff_url),
        holder.id, holder.university_id,
        'This staff page is already attached to another school.');
      NEW.coaching_staff_url := CASE WHEN TG_OP = 'UPDATE' THEN OLD.coaching_staff_url ELSE NULL END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_link_collision_guard ON public.programs;
CREATE TRIGGER programs_link_collision_guard
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_link_collisions();

CREATE INDEX IF NOT EXISTS programs_athletic_host_idx ON public.programs (public.link_host_only(athletic_website));
CREATE INDEX IF NOT EXISTS programs_roster_key_idx ON public.programs (public.link_host(roster_url));
CREATE INDEX IF NOT EXISTS programs_staff_key_idx ON public.programs (public.link_host(coaching_staff_url));