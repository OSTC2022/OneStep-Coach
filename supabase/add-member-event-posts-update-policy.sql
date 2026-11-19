-- 작성자 본인 게시글 수정 허용
-- Supabase SQL Editor에서 실행하세요.

DROP POLICY IF EXISTS member_event_posts_update_own ON public.member_event_posts;
CREATE POLICY member_event_posts_update_own ON public.member_event_posts
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
