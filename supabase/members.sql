-- 회원 테이블만 빠르게 생성 (Supabase Dashboard > SQL Editor에서 실행)
-- 전체 스키마는 supabase/schema.sql 참고

CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  grade TEXT,
  phone TEXT,
  parent_phone TEXT,
  sport TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  bmi NUMERIC,
  goal TEXT,
  injury_history TEXT,
  memo TEXT,
  primary_instructor_id UUID,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
CREATE POLICY "Authenticated users full access members"
  ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
