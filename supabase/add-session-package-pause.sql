-- 월정액 수업권 일시정지
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.session_packages
  ADD COLUMN IF NOT EXISTS paused_at DATE;

ALTER TABLE public.session_packages
  ADD COLUMN IF NOT EXISTS total_paused_days INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.session_packages.paused_at IS '일시정지 시작일 — NULL이면 정상 이용';
COMMENT ON COLUMN public.session_packages.total_paused_days IS '누적 일시정지 일수 (재개 시 expires_at 연장에 반영)';

CREATE INDEX IF NOT EXISTS session_packages_paused_at_idx
  ON public.session_packages (paused_at)
  WHERE paused_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
