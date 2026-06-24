-- 센터 러닝 스케줄 요일별 날짜 (이번 주 월~일)
ALTER TABLE public.center_running_training_schedule_days
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

COMMENT ON COLUMN public.center_running_training_schedule_days.schedule_date IS '이번 주 해당 요일 날짜 (관리자가 월요일 기준으로 설정)';

NOTIFY pgrst, 'reload schema';
