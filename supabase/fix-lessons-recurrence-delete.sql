-- 반복 수업 삭제·수정 지원 (컬럼 + RLS + 권한)
-- 캘린더에서 반복 일정이 삭제되지 않을 때 Supabase SQL Editor에서 실행
-- 기존 데이터는 유지됩니다.

-- 1) 반복 시리즈 연결 컬럼
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;

CREATE INDEX IF NOT EXISTS idx_lessons_recurrence_group_date
  ON public.lessons (recurrence_group_id, lesson_date)
  WHERE recurrence_group_id IS NOT NULL;

-- 2) 테이블 권한 (삭제 포함)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

-- 3) RLS — 관리자·강사 삭제 허용
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'coach'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('coach', 'instructor')
  );
$$;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;
DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
DROP POLICY IF EXISTS "lessons_coach_own" ON public.lessons;
DROP POLICY IF EXISTS "lessons_coach_all" ON public.lessons;
DROP POLICY IF EXISTS "lessons_member_own" ON public.lessons;

CREATE POLICY "lessons_admin_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "lessons_coach_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_coach())
  WITH CHECK (public.is_coach());

CREATE POLICY "lessons_member_own" ON public.lessons
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

NOTIFY pgrst, 'reload schema';
