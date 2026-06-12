-- Google OAuth state (쿠키 대신 DB 저장 — invalid state 방지)
ALTER TABLE public.google_calendar_sync
  ADD COLUMN IF NOT EXISTS oauth_state TEXT,
  ADD COLUMN IF NOT EXISTS oauth_state_expires_at TIMESTAMPTZ;
