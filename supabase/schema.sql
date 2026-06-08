-- OneStep Coach database schema
-- Run in Supabase Dashboard > SQL Editor

-- Users (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'instructor', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Instructors
CREATE TABLE IF NOT EXISTS public.instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  kakao_id TEXT,
  instagram_id TEXT,
  speciality TEXT[] DEFAULT '{}',
  hourly_rate_weekday NUMERIC NOT NULL DEFAULT 30000,
  hourly_rate_weekend NUMERIC NOT NULL DEFAULT 40000,
  extra_member_rate NUMERIC NOT NULL DEFAULT 10000,
  calendar_color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  grade TEXT,
  school TEXT,
  phone TEXT,
  parent_phone TEXT,
  kakao_id TEXT,
  instagram_id TEXT,
  sport TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  bmi NUMERIC,
  goal TEXT,
  injury_history TEXT,
  memo TEXT,
  primary_instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session packages
CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  price NUMERIC,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signatures
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  lesson_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  lesson_type TEXT NOT NULL DEFAULT 'individual',
  title TEXT,
  content TEXT,
  special_note TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent', 'makeup', 'cancelled')),
  session_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  lesson_no INTEGER,
  signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_lesson_id_fkey;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read users"
  ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Authenticated users full access instructors"
  ON public.instructors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access members"
  ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access lessons"
  ON public.lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- After running this schema, create an admin account:
-- 1. Supabase Dashboard > Authentication > Users > Add user
--    (email + password, check "Auto Confirm User")
-- 2. Run the SQL below with your user's UUID and email:
--
-- INSERT INTO public.users (id, email, full_name, role)
-- VALUES ('YOUR-USER-UUID', 'your@email.com', 'Admin', 'admin')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
