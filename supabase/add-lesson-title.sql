-- 회원 없이 캘린더 일정 추가 (표시 이름)
ALTER TABLE public.lessons
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.lessons.title IS '회원 미연결 시 캘린더 표시 이름';

NOTIFY pgrst, 'reload schema';
