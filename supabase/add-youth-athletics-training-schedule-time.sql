-- 육상선수반 훈련 스케줄 — 요일별 시작/집합 시각

ALTER TABLE public.center_youth_athletics_training_schedule_days
  ADD COLUMN IF NOT EXISTS training_time TEXT;

COMMENT ON COLUMN public.center_youth_athletics_training_schedule_days.training_time IS
  '집합/시작 시각 (HH:MM), 선택';

NOTIFY pgrst, 'reload schema';
