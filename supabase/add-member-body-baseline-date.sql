-- 신체정보 초기 설정 날짜 (등록일과 별도, 관리자만 조정)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS body_baseline_recorded_at DATE;

COMMENT ON COLUMN public.members.body_baseline_recorded_at IS '신체정보 초기 설정 기준일 (미설정 시 registered_at 사용)';
