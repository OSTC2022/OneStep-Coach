-- 기록 맞추기 이벤트 당첨자
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.member_record_match_events
  ADD COLUMN IF NOT EXISTS winners JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.member_record_match_events.winners IS
  '당첨자 목록 [{ "memberId": "uuid", "prizeIndex": 0 }]';

NOTIFY pgrst, 'reload schema';
