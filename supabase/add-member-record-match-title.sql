-- 기록 맞추기 이벤트 제목
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.member_record_match_events
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.member_record_match_events.title IS '이벤트 표시 제목 (비어 있으면 대회명 사용)';

NOTIFY pgrst, 'reload schema';
