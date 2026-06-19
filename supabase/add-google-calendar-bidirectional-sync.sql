-- Google Calendar 양방향 동기화 (최근 수정 우선)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS app_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lessons_app_modified_at_idx
  ON public.lessons (app_modified_at DESC)
  WHERE app_modified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_google_push_pending_idx
  ON public.lessons (lesson_date)
  WHERE google_event_id IS NULL
    AND app_modified_at IS NOT NULL;
