-- 강사·센터 블로그 URL

ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS blog_url TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS blog_url TEXT;

NOTIFY pgrst, 'reload schema';
