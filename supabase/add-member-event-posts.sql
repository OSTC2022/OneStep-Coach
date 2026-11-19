-- 회원 포털 이벤트 탭 게시글
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS public.member_event_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_event_posts
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE public.member_event_posts
  ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS member_event_posts_created_idx
  ON public.member_event_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS member_event_posts_notice_created_idx
  ON public.member_event_posts (is_notice DESC, created_at DESC);

ALTER TABLE public.member_event_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_event_posts_read ON public.member_event_posts;
CREATE POLICY member_event_posts_read ON public.member_event_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS member_event_posts_insert_own ON public.member_event_posts;
CREATE POLICY member_event_posts_insert_own ON public.member_event_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS member_event_posts_delete_own ON public.member_event_posts;
CREATE POLICY member_event_posts_delete_own ON public.member_event_posts
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS member_event_posts_update_own ON public.member_event_posts;
CREATE POLICY member_event_posts_update_own ON public.member_event_posts
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

COMMENT ON TABLE public.member_event_posts IS '회원 포털 이벤트 탭에 회원이 올리는 게시글';

CREATE TABLE IF NOT EXISTS public.member_event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.member_event_posts(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_event_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.member_event_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS member_event_comments_post_idx
  ON public.member_event_comments (post_id, created_at);

CREATE INDEX IF NOT EXISTS member_event_comments_parent_idx
  ON public.member_event_comments (parent_id, created_at);

ALTER TABLE public.member_event_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_event_comments_read ON public.member_event_comments;
CREATE POLICY member_event_comments_read ON public.member_event_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS member_event_comments_insert_own ON public.member_event_comments;
CREATE POLICY member_event_comments_insert_own ON public.member_event_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS member_event_comments_delete_own ON public.member_event_comments;
CREATE POLICY member_event_comments_delete_own ON public.member_event_comments
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.member_event_comments IS '회원 포털 이벤트 게시글 댓글';

NOTIFY pgrst, 'reload schema';
