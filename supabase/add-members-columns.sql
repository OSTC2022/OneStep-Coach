-- members 테이블 누락 컬럼 추가 (기존 테이블·데이터 유지)
-- Supabase Dashboard > SQL Editor에서 실행
--
-- 앱 코드 기준 (lib/actions/members.ts createMember/updateMember, Member 타입):
--   name, birth_date, age, grade, phone, parent_phone, sport,
--   height_cm, weight_kg, bmi, goal, injury_history, memo,
--   primary_instructor_id, registered_at, is_active, created_at, user_id

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS sport TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS height_cm NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS weight_kg NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS bmi NUMERIC;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS injury_history TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS primary_instructor_id UUID;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
