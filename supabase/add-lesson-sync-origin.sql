-- 일정 동기화 출처·충돌 방지 필드 및 Google 중복 방지 인덱스

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS sync_origin TEXT
    CHECK (sync_origin IS NULL OR sync_origin IN ('app', 'google')),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.lessons.sync_origin IS
  '마지막 수정 출처: app(앱에서 수정) | google(Google 동기화)';
COMMENT ON COLUMN public.lessons.last_synced_at IS
  'Google Calendar와 마지막으로 동기화된 시각';

CREATE INDEX IF NOT EXISTS lessons_lesson_date_start_time_idx
  ON public.lessons (lesson_date, start_time);

CREATE INDEX IF NOT EXISTS lessons_instructor_date_idx
  ON public.lessons (instructor_id, lesson_date)
  WHERE instructor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_google_event_id_idx
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL;

-- Google 중복 방지 unique index는 add-lessons-google-unique-indexes.sql 참고
