-- 러닝 포털 랭킹 상태 메시지 (회원 본인 프로필에서만 수정)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS ranking_status_message TEXT;

COMMENT ON COLUMN public.members.ranking_status_message IS '러닝 포털 랭킹 이름 옆 상태 메시지 (최대 15자, 본인만 수정)';
