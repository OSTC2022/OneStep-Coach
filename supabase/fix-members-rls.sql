-- members 테이블 RLS — 관리자·강사 회원 등록·수정 허용
-- "row-level security" / 데이터베이스 권한 오류 시 Supabase SQL Editor에서 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

-- is_admin: profiles·users·보호 관리자 이메일
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

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.members;
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_insert_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_update_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_delete_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_admin_all" ON public.members;
DROP POLICY IF EXISTS "members_coach_assigned" ON public.members;
DROP POLICY IF EXISTS "members_coach_write" ON public.members;
DROP POLICY IF EXISTS "members_coach_update" ON public.members;
DROP POLICY IF EXISTS "members_self_read" ON public.members;

-- 관리자: 전체 CRUD
CREATE POLICY "members_admin_all" ON public.members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 강사: 담당 회원 조회 + 신규 등록·수정 (앱에서 강사도 회원 등록)
CREATE POLICY "members_coach_assigned" ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND primary_instructor_id = public.current_instructor_id()
  );

CREATE POLICY "members_coach_write" ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_coach());

CREATE POLICY "members_coach_update" ON public.members
  FOR UPDATE TO authenticated
  USING (public.is_coach())
  WITH CHECK (public.is_coach());

-- 회원 본인 조회
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
