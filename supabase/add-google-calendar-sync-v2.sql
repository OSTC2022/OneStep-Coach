-- Google Calendar 동기화 상태·중복 방지 (v2)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_status_detail TEXT;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_account_id TEXT;

-- 기존 단일 google_event_id 인덱스 → 복합 unique 로 교체
DROP INDEX IF EXISTS public.lessons_google_event_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_sync_unique
  ON public.lessons (google_account_id, google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL;

-- google_event_id 단독 중복 방지 (account/calendar 미기록 레거시 행용)
CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_event_id_unique
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL
    AND (google_account_id IS NULL OR google_calendar_id IS NULL);
