-- 회원 로그인 후 본인 members 행 조회 (auth_user_id · user_id 모두 인식)
-- 마이페이지가 비어 보이거나 current_member_id()가 null일 때 실행

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members
  WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "members_self_read" ON public.members;
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;
CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
