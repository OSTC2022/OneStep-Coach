-- 강사료 타임별 관리자 수동 조정 (강사는 조회만)
CREATE TABLE IF NOT EXISTS public.instructor_pay_slot_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  pay_amount NUMERIC NOT NULL CHECK (pay_amount >= 0),
  member_count INTEGER CHECK (member_count IS NULL OR member_count >= 1),
  note TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_instructor_pay_slot_overrides_instructor
  ON public.instructor_pay_slot_overrides (instructor_id);

ALTER TABLE public.instructor_pay_slot_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_pay_slot_overrides_select ON public.instructor_pay_slot_overrides;
CREATE POLICY instructor_pay_slot_overrides_select ON public.instructor_pay_slot_overrides
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS instructor_pay_slot_overrides_admin_write ON public.instructor_pay_slot_overrides;
CREATE POLICY instructor_pay_slot_overrides_admin_write ON public.instructor_pay_slot_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
