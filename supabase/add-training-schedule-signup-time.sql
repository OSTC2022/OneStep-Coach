-- 훈련 스케줄 참여 시각. 요일에 시간을 여러 개 두면 참여 때 하나를 고른다.

ALTER TABLE public.center_running_training_schedule_signups
  ADD COLUMN IF NOT EXISTS signup_time TEXT;

ALTER TABLE public.center_youth_athletics_training_schedule_signups
  ADD COLUMN IF NOT EXISTS signup_time TEXT;

COMMENT ON COLUMN public.center_running_training_schedule_signups.signup_time IS
  '참여 시 선택한 시각 (HH:MM)';

COMMENT ON COLUMN public.center_youth_athletics_training_schedule_signups.signup_time IS
  '참여 시 선택한 시각 (HH:MM)';

NOTIFY pgrst, 'reload schema';
