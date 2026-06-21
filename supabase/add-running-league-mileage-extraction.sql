-- 러닝 마일리지 스크린샷 추출 필드 확장
-- Supabase SQL Editor에서 실행

ALTER TABLE public.running_league_mileage_logs
  ADD COLUMN IF NOT EXISTS duration TEXT,
  ADD COLUMN IF NOT EXISTS pace TEXT,
  ADD COLUMN IF NOT EXISTS heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS calories INTEGER,
  ADD COLUMN IF NOT EXISTS activity_time TEXT,
  ADD COLUMN IF NOT EXISTS source_app TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS image_hash TEXT,
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_raw_json JSONB,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'running_league_mileage_logs_verification_status_check'
  ) THEN
    ALTER TABLE public.running_league_mileage_logs
      ADD CONSTRAINT running_league_mileage_logs_verification_status_check
      CHECK (verification_status IN ('pending', 'confirmed', 'manual', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS running_league_mileage_logs_dup_idx
  ON public.running_league_mileage_logs (member_id, logged_at, distance_km, duration, image_hash);

COMMENT ON COLUMN public.running_league_mileage_logs.duration IS '총 운동 시간 (예: 1:00:27)';
COMMENT ON COLUMN public.running_league_mileage_logs.pace IS '평균 페이스 (예: 4:29)';
COMMENT ON COLUMN public.running_league_mileage_logs.screenshot_url IS '러닝 앱 스크린샷 URL';
COMMENT ON COLUMN public.running_league_mileage_logs.image_hash IS '스크린샷 SHA-256 (중복 방지)';

-- 스크린샷 저장 버킷 (서비스 롤 업로드)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'running-mileage-screenshots',
  'running-mileage-screenshots',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;
