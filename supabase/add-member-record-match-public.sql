-- 기록 맞추기 공개 이벤트 + 링크 게스트 댓글
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.member_record_match_events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS member_record_match_events_public_idx
  ON public.member_record_match_events (is_public, created_at DESC)
  WHERE is_public = TRUE;

CREATE TABLE IF NOT EXISTS public.member_record_match_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.member_record_match_events(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_record_match_comments_event_idx
  ON public.member_record_match_comments (event_id, created_at ASC);

ALTER TABLE public.member_record_match_comments ENABLE ROW LEVEL SECURITY;

-- 공개 API는 서비스 롤로만 접근. authenticated 스태프는 포털에서 조회 가능.
DROP POLICY IF EXISTS member_record_match_comments_staff_read ON public.member_record_match_comments;
CREATE POLICY member_record_match_comments_staff_read ON public.member_record_match_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coach', 'instructor')
    )
  );

DROP POLICY IF EXISTS member_record_match_comments_staff_delete ON public.member_record_match_comments;
CREATE POLICY member_record_match_comments_staff_delete ON public.member_record_match_comments
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.member_record_match_events e
      WHERE e.id = event_id
        AND e.created_by = auth.uid()
    )
  );

COMMENT ON COLUMN public.member_record_match_events.is_public IS '링크를 아는 누구나 접속·댓글 가능한 공개 이벤트 (관리자/강사만 설정)';
COMMENT ON TABLE public.member_record_match_comments IS '공개 기록 맞추기 이벤트의 게스트 댓글 (이름+비밀번호)';

NOTIFY pgrst, 'reload schema';
