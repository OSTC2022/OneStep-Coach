-- 이벤트 게시판 공지 여부
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.member_event_posts
  ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS member_event_posts_notice_created_idx
  ON public.member_event_posts (is_notice DESC, created_at DESC);

NOTIFY pgrst, 'reload schema';
