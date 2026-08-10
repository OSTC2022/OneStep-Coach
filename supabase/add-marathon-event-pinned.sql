-- 대회 일정 상단 고정 (관리자·강사)
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS center_marathon_events_pinned_idx
  ON public.center_marathon_events (is_pinned DESC, event_date ASC);

COMMENT ON COLUMN public.center_marathon_events.is_pinned IS '회원 포털 대회 일정 상단 고정';
