-- 캘린더 표시 텍스트·글자 크기
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS calendar_font_size REAL;

COMMENT ON COLUMN public.lessons.title IS '캘린더 표시 텍스트 (회원 연결 시에도 사용 가능)';
COMMENT ON COLUMN public.lessons.calendar_font_size IS '캘린더 블록 글자 크기(px)';

NOTIFY pgrst, 'reload schema';
