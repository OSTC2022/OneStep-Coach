-- 강사별 캘린더 색상
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS calendar_color TEXT;

COMMENT ON COLUMN public.instructors.calendar_color IS 'Hex color for calendar lesson blocks (#38BDF8 etc.)';
