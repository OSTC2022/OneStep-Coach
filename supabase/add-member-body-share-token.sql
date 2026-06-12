-- 회원 신체·컨디션 그래프 외부 공유 링크 (토큰 URL, 읽기 전용)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS body_share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_body_share_token
  ON public.members (body_share_token)
  WHERE body_share_token IS NOT NULL;

COMMENT ON COLUMN public.members.body_share_token IS '신체·컨디션 그래프 공유 URL용 비공개 토큰';
