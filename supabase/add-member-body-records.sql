-- 회원 체중·신체 변화 이력 (그래프용)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.member_body_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  height_cm NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_member_body_records_member_date
  ON public.member_body_records (member_id, recorded_at ASC);

COMMENT ON TABLE public.member_body_records IS '회원 체중 변화 추적 (신체 변화 그래프)';

ALTER TABLE public.member_body_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_body_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_body_records TO service_role;

DROP POLICY IF EXISTS "member_body_records_admin_all" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_coach_read" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_coach_write" ON public.member_body_records;

CREATE POLICY "member_body_records_admin_all" ON public.member_body_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "member_body_records_coach_read" ON public.member_body_records
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_body_records.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );

CREATE POLICY "member_body_records_coach_write" ON public.member_body_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_body_records.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );
