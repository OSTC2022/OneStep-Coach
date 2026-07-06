-- 센터 훈련 스케줄 참여를 주간 날짜별로 구분
-- 실행: Supabase SQL Editor

ALTER TABLE public.center_running_training_schedule_signups
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

COMMENT ON COLUMN public.center_running_training_schedule_signups.schedule_date IS
  '참여한 해당 요일의 날짜 (스케줄 변경 시 이전 주 참여와 구분)';

ALTER TABLE public.center_running_training_schedule_signups
  DROP CONSTRAINT IF EXISTS center_running_training_schedule_signups_weekday_member_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS center_running_training_schedule_signups_week_member_date_idx
  ON public.center_running_training_schedule_signups (weekday, member_id, schedule_date)
  WHERE schedule_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS center_running_training_schedule_signups_week_member_legacy_idx
  ON public.center_running_training_schedule_signups (weekday, member_id)
  WHERE schedule_date IS NULL;

NOTIFY pgrst, 'reload schema';
