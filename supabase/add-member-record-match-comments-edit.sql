-- 기록 맞추기 댓글: 회원 댓글 + 수정시각
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.member_record_match_comments
  ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.member_record_match_comments
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.member_record_match_comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS member_record_match_comments_author_idx
  ON public.member_record_match_comments (author_user_id, created_at DESC);

DROP POLICY IF EXISTS member_record_match_comments_member_read ON public.member_record_match_comments;
CREATE POLICY member_record_match_comments_member_read ON public.member_record_match_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS member_record_match_comments_member_insert ON public.member_record_match_comments;
CREATE POLICY member_record_match_comments_member_insert ON public.member_record_match_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS member_record_match_comments_member_update ON public.member_record_match_comments;
CREATE POLICY member_record_match_comments_member_update ON public.member_record_match_comments
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_user_id = auth.uid() OR public.is_admin());

COMMENT ON COLUMN public.member_record_match_comments.author_user_id IS '회원 댓글 작성자 (게스트면 null)';
COMMENT ON COLUMN public.member_record_match_comments.password_hash IS '게스트 댓글 비밀번호 (회원이면 null)';
COMMENT ON COLUMN public.member_record_match_comments.updated_at IS '댓글 수정 시각 (수정 표시용)';

NOTIFY pgrst, 'reload schema';
