-- 반복 수업 시리즈 연결
-- Supabase SQL Editor에서 실행

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;

CREATE INDEX IF NOT EXISTS idx_lessons_recurrence_group_date
  ON public.lessons (recurrence_group_id, lesson_date)
  WHERE recurrence_group_id IS NOT NULL;
