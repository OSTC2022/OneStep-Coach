-- lessons RLS — 관리자·강사 캘린더 수업 등록·수정 허용
-- "row-level security policy for table lessons" 오류 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO service_role;

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

-- 강사: 캘린더 전체 관리 (자율배정·타 강사 일정 포함)
CREATE POLICY "lessons_coach_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_coach())
  WITH CHECK (public.is_coach());

CREATE POLICY "lessons_member_own" ON public.lessons
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

NOTIFY pgrst, 'reload schema';
