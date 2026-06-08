-- 학교/소속팀 + 회원 본인 기본 정보 수정
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS school TEXT;

DROP POLICY IF EXISTS "members_self_update" ON public.members;
CREATE POLICY "members_self_update" ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
