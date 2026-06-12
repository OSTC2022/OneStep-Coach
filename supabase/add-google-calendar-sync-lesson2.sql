-- Google Calendar 「수업2」 캘린더 추가 연동
-- Supabase SQL Editor에서 add-google-calendar-sync.sql 실행 후 이 파일을 실행하세요.

ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS calendar_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS calendar_name_2 TEXT,
  ADD COLUMN IF NOT EXISTS sync_token_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_channel_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_resource_id_2 TEXT,
  ADD COLUMN IF NOT EXISTS watch_expiration_2 TIMESTAMPTZ;
