-- 성인 러닝 포털 — 마일리지·출석 랭킹 기간 시작일 (수동 초기화 전까지 유지)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_ranking_cycle_start_date DATE;

COMMENT ON COLUMN public.center_settings.adult_running_portal_ranking_cycle_start_date IS
  '마일리지·출석 랭킹 기간 시작일. 월말 자동 초기화 없음. 관리자 초기화 시 오늘로 갱신.';

-- 기존 센터: 당월 1일부터 누적 중이던 것으로 간주 (이후 월이 바뀌어도 자동으로 바뀌지 않음)
UPDATE public.center_settings
SET adult_running_portal_ranking_cycle_start_date = date_trunc('month', CURRENT_DATE)::date
WHERE id = 'default'
  AND adult_running_portal_ranking_cycle_start_date IS NULL;
