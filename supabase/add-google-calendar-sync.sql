-- Google Calendar → 원스텝 코치 수업 동기화 (센터 공용)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.google_calendar_sync (
  id TEXT PRIMARY KEY DEFAULT 'default',
  connected_email TEXT,
  refresh_token TEXT,
  calendar_id TEXT,
  calendar_name TEXT,
  sync_token TEXT,
  watch_channel_id TEXT,
  watch_resource_id TEXT,
  watch_expiration TIMESTAMPTZ,
  sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  pending_member_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_event_id_unique
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_google_sync_pending_idx
  ON public.lessons (google_sync_status)
  WHERE google_sync_status = 'pending_member';

ALTER TABLE public.google_calendar_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read google calendar sync"
  ON public.google_calendar_sync;

CREATE POLICY "Authenticated users can read google calendar sync"
  ON public.google_calendar_sync FOR SELECT TO authenticated USING (true);
