-- 성인회원 권한 + 성인 전용 공지·이벤트 게시판

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'coach', 'member', 'guardian', 'adult_member'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'general';

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_audience_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_audience_check
  CHECK (audience IN ('general', 'adult'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS event_subtype TEXT;

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_event_subtype_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_event_subtype_check
  CHECK (event_subtype IS NULL OR event_subtype IN ('mileage_challenge', 'running_league'));

ALTER TABLE public.center_board_posts
  ADD COLUMN IF NOT EXISTS challenge_goal_km NUMERIC;

CREATE INDEX IF NOT EXISTS center_board_posts_audience_idx
  ON public.center_board_posts (audience, kind, is_published, pinned DESC, created_at DESC);

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
        AND (
          (audience = 'general' AND p.role IN ('member', 'guardian', 'coach', 'admin'))
          OR (audience = 'adult' AND p.role IN ('adult_member', 'admin'))
        )
    )
  );

COMMENT ON COLUMN public.center_board_posts.audience IS 'general | adult — 노출 대상';
COMMENT ON COLUMN public.center_board_posts.event_subtype IS 'mileage_challenge 등 이벤트 유형';
COMMENT ON COLUMN public.center_board_posts.challenge_goal_km IS '마일리지 챌린지 목표(km)';

NOTIFY pgrst, 'reload schema';
