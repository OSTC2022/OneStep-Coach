-- lessons · instructors 테이블·RLS (최소 버전)
-- Supabase SQL Editor에서 전체 선택 후 Run
-- members 테이블만 있어도 실행 가능합니다.

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

CREATE TABLE IF NOT EXISTS public.instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  speciality TEXT[] DEFAULT '{}',
  hourly_rate_weekday NUMERIC NOT NULL DEFAULT 30000,
  hourly_rate_weekend NUMERIC NOT NULL DEFAULT 40000,
  extra_member_rate NUMERIC NOT NULL DEFAULT 10000,
  calendar_color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  signature_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;

CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access instructors"
  ON public.instructors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access lessons"
  ON public.lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_signature_id_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_signature_id_fkey
      FOREIGN KEY (signature_id) REFERENCES public.signatures(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signatures TO authenticated;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access signatures" ON public.signatures;
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- 기존 DB: 강사 캘린더 색상 컬럼
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;

-- 기존 DB: 회원 없는 캘린더 일정
ALTER TABLE public.lessons
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title TEXT;
