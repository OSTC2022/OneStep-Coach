-- 센터 공지사항 · 이벤트 게시판 (회원 포털 헤더)

CREATE TABLE IF NOT EXISTS public.center_board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('notice', 'event')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link_url TEXT,
  event_starts_at TIMESTAMPTZ,
  event_ends_at TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT true,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS center_board_posts_list_idx
  ON public.center_board_posts (kind, is_published, pinned DESC, created_at DESC);

ALTER TABLE public.center_board_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_board_posts_member_read ON public.center_board_posts;
CREATE POLICY center_board_posts_member_read ON public.center_board_posts
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_board_posts_admin_all ON public.center_board_posts;
CREATE POLICY center_board_posts_admin_all ON public.center_board_posts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.center_board_posts IS '회원 포털 공지사항·이벤트 게시글';
COMMENT ON COLUMN public.center_board_posts.kind IS 'notice | event';

NOTIFY pgrst, 'reload schema';
