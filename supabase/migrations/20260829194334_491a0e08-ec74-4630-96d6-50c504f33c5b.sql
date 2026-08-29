-- ENUMS
CREATE TYPE public.user_type AS ENUM ('superadmin','org_admin','org_staff','parent','player');
CREATE TYPE public.billing_status AS ENUM ('trial','invoice_sent','active','suspended','canceled');
CREATE TYPE public.campus_setting AS ENUM ('urban','suburban','rural');
CREATE TYPE public.school_size_bucket AS ENUM ('small','medium','large');
CREATE TYPE public.public_private AS ENUM ('public','private');
CREATE TYPE public.sport AS ENUM ('baseball','softball');
CREATE TYPE public.governing_body AS ENUM ('NCAA','NAIA','NJCAA');
CREATE TYPE public.class_year AS ENUM ('FR','SO','JR','SR','GR');
CREATE TYPE public.player_position AS ENUM ('C','1B','2B','3B','SS','OF','UTIL','RHP','LHP','TWO_WAY');
CREATE TYPE public.bats_hand AS ENUM ('R','L','S');
CREATE TYPE public.throws_hand AS ENUM ('R','L');
CREATE TYPE public.source_type AS ENUM ('official','aggregator','manual');
CREATE TYPE public.classification_type AS ENUM ('academic_bucket','campus_culture','school_size','geographic_region','campus_setting');
CREATE TYPE public.audit_action AS ENUM ('create','update','override');

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_contact_email text,
  billing_status public.billing_status NOT NULL DEFAULT 'trial',
  is_founding_free_org boolean NOT NULL DEFAULT false,
  annual_fee_amount numeric,
  stripe_customer_id text,
  stripe_invoice_id text,
  stripe_invoice_url text,
  invoice_sent_at timestamptz,
  paid_at timestamptz,
  access_expires_at timestamptz,
  logo_url text,
  brand_primary_color text,
  brand_accent_color text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  user_type public.user_type NOT NULL DEFAULT 'player',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  linked_org_athlete_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- USER ROLES (authoritative role storage, separate from profile)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'superadmin'::public.user_type);
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'org_admin'::public.user_type)
      OR public.has_role(auth.uid(), 'org_staff'::public.user_type);
$$;

-- signup trigger: create profile + role row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _type public.user_type;
BEGIN
  BEGIN
    _type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'player')::public.user_type;
  EXCEPTION WHEN others THEN
    _type := 'player'::public.user_type;
  END;

  INSERT INTO public.users (id, email, name, user_type)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _type)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _type)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UNIVERSITIES
CREATE TABLE public.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  state text,
  address text,
  region text,
  campus_setting public.campus_setting,
  undergrad_enrollment integer,
  school_size_bucket public.school_size_bucket,
  public_private public.public_private,
  religious_affiliation boolean NOT NULL DEFAULT false,
  religious_tradition text,
  website_url text,
  admissions_url text,
  nearest_airport text,
  distance_to_airport_miles numeric,
  avg_gpa numeric,
  avg_sat integer,
  avg_act integer,
  acceptance_rate numeric,
  test_optional boolean,
  graduation_rate numeric,
  student_faculty_ratio text,
  tuition_in_state numeric,
  tuition_out_state numeric,
  room_board numeric,
  est_cost_of_attendance numeric,
  est_net_price numeric,
  tuition_source_url text,
  financial_aid_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universities TO authenticated;
GRANT ALL ON public.universities TO service_role;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

-- MAJORS
CREATE TABLE public.majors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.majors TO authenticated;
GRANT ALL ON public.majors TO service_role;
ALTER TABLE public.majors ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.university_majors (
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  major_id uuid NOT NULL REFERENCES public.majors(id) ON DELETE CASCADE,
  PRIMARY KEY (university_id, major_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.university_majors TO authenticated;
GRANT ALL ON public.university_majors TO service_role;
ALTER TABLE public.university_majors ENABLE ROW LEVEL SECURITY;

-- PROGRAMS
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  sport public.sport NOT NULL,
  governing_body public.governing_body,
  division text,
  conference text,
  athletic_website text,
  coaching_staff_url text,
  roster_url text,
  facility_url text,
  head_coach_name text,
  recruiting_coordinator_name text,
  scholarships_available boolean,
  scholarship_details text,
  last_roster_pull_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- ROSTER PLAYERS
CREATE TABLE public.roster_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  season_year integer,
  name text NOT NULL,
  class_year public.class_year,
  position public.player_position,
  bats public.bats_hand,
  throws public.throws_hand,
  hometown text,
  home_state text,
  home_country text,
  is_transfer boolean NOT NULL DEFAULT false,
  is_juco_transfer boolean NOT NULL DEFAULT false,
  two_way boolean NOT NULL DEFAULT false,
  sport_specific_attributes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_players TO authenticated;
GRANT ALL ON public.roster_players TO service_role;
ALTER TABLE public.roster_players ENABLE ROW LEVEL SECURITY;

-- DATA FIELD SOURCES
CREATE TABLE public.data_field_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  field_name text NOT NULL,
  source_url text,
  source_type public.source_type NOT NULL DEFAULT 'official',
  last_verified_at timestamptz,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_field_sources TO authenticated;
GRANT ALL ON public.data_field_sources TO service_role;
ALTER TABLE public.data_field_sources ENABLE ROW LEVEL SECURITY;

-- CLASSIFICATIONS
CREATE TABLE public.classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  classification_type public.classification_type NOT NULL,
  value text,
  ai_suggested_value text,
  is_staff_overridden boolean NOT NULL DEFAULT false,
  override_reason text,
  evidence_text text,
  evidence_source_url text,
  confidence_score numeric,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classifications TO authenticated;
GRANT ALL ON public.classifications TO service_role;
ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id uuid,
  field_name text,
  old_value text,
  new_value text,
  action public.audit_action NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- POLICIES: shared college database (read-only for all signed-in users, full write for superadmin)
CREATE POLICY "universities readable by authenticated" ON public.universities FOR SELECT TO authenticated USING (true);
CREATE POLICY "universities writable by superadmin" ON public.universities FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "majors readable by authenticated" ON public.majors FOR SELECT TO authenticated USING (true);
CREATE POLICY "majors writable by superadmin" ON public.majors FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "university_majors readable by authenticated" ON public.university_majors FOR SELECT TO authenticated USING (true);
CREATE POLICY "university_majors writable by superadmin" ON public.university_majors FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "programs readable by authenticated" ON public.programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "programs writable by superadmin" ON public.programs FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "roster_players readable by authenticated" ON public.roster_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "roster_players writable by superadmin" ON public.roster_players FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "classifications readable by authenticated" ON public.classifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "classifications writable by superadmin" ON public.classifications FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "data_field_sources readable by authenticated" ON public.data_field_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "data_field_sources writable by superadmin" ON public.data_field_sources FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- POLICIES: audit log (superadmin only)
CREATE POLICY "audit_log superadmin only" ON public.audit_log FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- POLICIES: organizations
CREATE POLICY "organizations superadmin full access" ON public.organizations FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "organizations members read own" ON public.organizations FOR SELECT TO authenticated USING (id = public.current_org_id());

-- POLICIES: users
CREATE POLICY "users superadmin full access" ON public.users FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "users read own row" ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "users update own row" ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "org managers read own org users" ON public.users FOR SELECT TO authenticated
  USING (public.is_org_manager() AND organization_id IS NOT NULL AND organization_id = public.current_org_id());

-- POLICIES: user_roles
CREATE POLICY "user_roles read own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles superadmin read all" ON public.user_roles FOR SELECT TO authenticated USING (public.is_superadmin());

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER universities_touch BEFORE UPDATE ON public.universities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER programs_touch BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SEED: founding organization
INSERT INTO public.organizations (name, is_founding_free_org, billing_status, billing_contact_email)
VALUES ('Power Baseball', true, 'active', 'billing@powerbaseball.example');

-- SEED: majors
INSERT INTO public.majors (name) VALUES
  ('Business Administration'),
  ('Kinesiology'),
  ('Computer Science'),
  ('Sport Management'),
  ('Nursing'),
  ('Mechanical Engineering');

-- SEED: universities
INSERT INTO public.universities (name, city, state, address, region, campus_setting, undergrad_enrollment, school_size_bucket, public_private, religious_affiliation, religious_tradition, website_url, admissions_url, nearest_airport, distance_to_airport_miles, avg_gpa, avg_sat, avg_act, acceptance_rate, test_optional, graduation_rate, student_faculty_ratio, tuition_in_state, tuition_out_state, room_board, est_cost_of_attendance, est_net_price, tuition_source_url, financial_aid_url)
VALUES
  ('Vanderbilt University','Nashville','TN','2201 West End Ave, Nashville, TN 37235','Southeast','urban',7151,'medium','private',false,NULL,'https://www.vanderbilt.edu','https://admissions.vanderbilt.edu','BNA',9.5,3.83,1520,34,0.057,true,0.94,'7:1',63946,63946,19604,89000,27500,'https://www.vanderbilt.edu/tuition','https://www.vanderbilt.edu/financialaid'),
  ('University of Texas at Austin','Austin','TX','110 Inner Campus Drive, Austin, TX 78712','Southwest','urban',42444,'large','public',false,NULL,'https://www.utexas.edu','https://admissions.utexas.edu','AUS',13.0,3.72,1420,31,0.29,true,0.88,'18:1',11752,42778,13792,32000,17800,'https://onestop.utexas.edu/tuition','https://onestop.utexas.edu/financial-aid'),
  ('Cal Poly San Luis Obispo','San Luis Obispo','CA','1 Grand Ave, San Luis Obispo, CA 93407','West','suburban',21500,'large','public',false,NULL,'https://www.calpoly.edu','https://admissions.calpoly.edu','SBP',4.0,4.0,1360,29,0.30,true,0.85,'19:1',11640,29520,16500,38000,22400,'https://afd.calpoly.edu/fees','https://afd.calpoly.edu/financialaid'),
  ('Creighton University','Omaha','NE','2500 California Plaza, Omaha, NE 68178','Midwest','urban',4500,'small','private',true,'Catholic (Jesuit)','https://www.creighton.edu','https://admissions.creighton.edu','OMA',6.0,3.79,1290,27,0.72,true,0.79,'11:1',45000,45000,12500,59500,31200,'https://www.creighton.edu/tuition','https://www.creighton.edu/financialaid'),
  ('Coastal Carolina University','Conway','SC','100 Chanticleer Dr E, Conway, SC 29528','Southeast','suburban',9800,'medium','public',false,NULL,'https://www.coastal.edu','https://www.coastal.edu/admissions','MYR',12.0,3.50,1130,23,0.83,true,0.52,'17:1',11640,27524,11200,40000,21600,'https://www.coastal.edu/tuition','https://www.coastal.edu/financialaid'),
  ('Emory University','Atlanta','GA','201 Dowman Dr, Atlanta, GA 30322','Southeast','suburban',7100,'medium','private',false,NULL,'https://www.emory.edu','https://apply.emory.edu','ATL',14.0,3.87,1500,33,0.11,true,0.91,'9:1',60774,60774,17500,84000,28900,'https://studentbilling.emory.edu','https://financialaid.emory.edu');

-- SEED: university majors
INSERT INTO public.university_majors (university_id, major_id)
SELECT u.id, m.id FROM public.universities u CROSS JOIN public.majors m
WHERE m.name IN ('Business Administration','Kinesiology','Computer Science');

-- SEED: programs
INSERT INTO public.programs (university_id, sport, governing_body, division, conference, athletic_website, coaching_staff_url, roster_url, head_coach_name, recruiting_coordinator_name, scholarships_available, scholarship_details, last_roster_pull_at, last_verified_at)
SELECT u.id, 'baseball','NCAA','D1', c.conference, c.site, c.site || '/coaches', c.site || '/roster', c.coach, c.rc, true, 'Partial scholarship sport, ~11.7 equivalencies', now() - interval '6 days', now() - interval '2 days'
FROM public.universities u
JOIN (VALUES
  ('Vanderbilt University','SEC','https://vucommodores.com/sports/baseball','Tim Corbin','Ty Blankmeyer'),
  ('University of Texas at Austin','Big 12','https://texassports.com/sports/baseball','Jim Schlossnagle','Steve Rodriguez'),
  ('Cal Poly San Luis Obispo','Big West','https://gopoly.com/sports/baseball','Larry Lee','Jake Silverman'),
  ('Creighton University','Big East','https://gocreighton.com/sports/baseball','Ed Servais','Connor Costello'),
  ('Coastal Carolina University','Sun Belt','https://goccusports.com/sports/baseball','Kevin Schnall','Matt Schilling'),
  ('Emory University','UAA','https://emoryathletics.com/sports/baseball','Mike Twardoski','Chad Sutherland')
) AS c(uname, conference, site, coach, rc) ON c.uname = u.name;

INSERT INTO public.programs (university_id, sport, governing_body, division, conference, athletic_website, roster_url, head_coach_name, scholarships_available, scholarship_details, last_roster_pull_at, last_verified_at)
SELECT u.id, 'softball','NCAA', CASE WHEN u.name = 'Emory University' THEN 'D3' ELSE 'D1' END, c.conference, c.site, c.site || '/roster', c.coach, true, 'Head-count sport, 12 full scholarships at D1', now() - interval '9 days', now() - interval '4 days'
FROM public.universities u
JOIN (VALUES
  ('University of Texas at Austin','Big 12','https://texassports.com/sports/softball','Mike White'),
  ('Coastal Carolina University','Sun Belt','https://goccusports.com/sports/softball','Kelley Green'),
  ('Emory University','UAA','https://emoryathletics.com/sports/softball','Kelly Peterson')
) AS c(uname, conference, site, coach) ON c.uname = u.name;

-- SEED: roster players
INSERT INTO public.roster_players (program_id, season_year, name, class_year, position, bats, throws, hometown, home_state, home_country, is_transfer, is_juco_transfer, two_way, sport_specific_attributes)
SELECT p.id, 2026, r.name, r.cy::public.class_year, r.pos::public.player_position, r.bats::public.bats_hand, r.thr::public.throws_hand, r.town, r.st, 'USA', r.tr, false, r.tw, r.attrs::jsonb
FROM public.programs p
JOIN public.universities u ON u.id = p.university_id
JOIN (VALUES
  ('Vanderbilt University','Jack Ellery','JR','RHP','R','R','Franklin','TN',false,false,'{"fastball_velo_mph": 95, "height_in": 75}'),
  ('Vanderbilt University','Miles Ortega','SO','SS','R','R','Scottsdale','AZ',false,false,'{"exit_velo_mph": 102, "sixty_time_s": 6.61}'),
  ('University of Texas at Austin','Cole Hanley','SR','C','R','R','Plano','TX',true,false,'{"pop_time_s": 1.92}'),
  ('University of Texas at Austin','Diego Ramos','FR','LHP','L','L','El Paso','TX',false,true,'{"fastball_velo_mph": 91}'),
  ('Cal Poly San Luis Obispo','Brady Nunez','JR','OF','L','L','Fresno','CA',false,false,'{"sixty_time_s": 6.48}'),
  ('Creighton University','Owen Petrick','SO','TWO_WAY','R','R','Lincoln','NE',false,false,'{"fastball_velo_mph": 89, "exit_velo_mph": 96}'),
  ('Coastal Carolina University','Tyler Beaumont','GR','1B','L','R','Charlotte','NC',true,true,'{"exit_velo_mph": 105}'),
  ('Emory University','Sam Whitfield','FR','2B','R','R','Marietta','GA',false,false,'{"sixty_time_s": 6.95}')
) AS r(uname, name, cy, pos, bats, thr, town, st, tr, tw, attrs) ON r.uname = u.name
WHERE p.sport = 'baseball';

-- SEED: classifications and source records
INSERT INTO public.classifications (university_id, classification_type, value, ai_suggested_value, is_staff_overridden, evidence_text, evidence_source_url, confidence_score)
SELECT id, 'academic_bucket', 'Highly Selective', 'Selective', true, 'Acceptance rate under 12% with median SAT above 1490.', website_url, 0.92
FROM public.universities WHERE name IN ('Vanderbilt University','Emory University');

INSERT INTO public.classifications (university_id, classification_type, value, ai_suggested_value, is_staff_overridden, evidence_text, evidence_source_url, confidence_score)
SELECT id, 'campus_setting', campus_setting::text, campus_setting::text, false, 'Derived from campus location and municipality density.', website_url, 0.81
FROM public.universities;

INSERT INTO public.data_field_sources (table_name, record_id, field_name, source_url, source_type, last_verified_at)
SELECT 'universities', id, 'tuition_out_state', tuition_source_url, 'official', now() - interval '3 days'
FROM public.universities;

INSERT INTO public.data_field_sources (table_name, record_id, field_name, source_url, source_type, last_verified_at)
SELECT 'programs', id, 'head_coach_name', coaching_staff_url, 'official', now() - interval '2 days'
FROM public.programs WHERE coaching_staff_url IS NOT NULL;