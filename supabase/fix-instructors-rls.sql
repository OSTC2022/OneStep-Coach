-- 강사(instructors) RLS — 관리자 등록·수정 허용
-- "new row violates row-level security policy for table instructors" 발생 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instructors TO service_role;

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

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;
DROP POLICY IF EXISTS "instructors_admin" ON public.instructors;
DROP POLICY IF EXISTS "instructors_coach_self" ON public.instructors;
DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;

CREATE POLICY "instructors_admin" ON public.instructors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "instructors_coach_self" ON public.instructors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
