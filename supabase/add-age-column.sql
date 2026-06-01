-- 기존 DB에 age 컬럼 추가 (Supabase SQL Editor에서 실행)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS age INTEGER;
