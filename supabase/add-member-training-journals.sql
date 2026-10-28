-- 회원별 훈련 일지 (수업현황 타일 · 알림장 옆)
-- admin / coach(instructor) 공유

CREATE TABLE IF NOT EXISTS public.member_training_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_training_journals_member_date_idx
  ON public.member_training_journals (member_id, training_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS member_training_journals_updated_idx
  ON public.member_training_journals (updated_at DESC);

ALTER TABLE public.member_training_journals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_training_journals_staff_all ON public.member_training_journals;
CREATE POLICY member_training_journals_staff_all ON public.member_training_journals
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_coach())
  WITH CHECK (public.is_admin() OR public.is_coach());

COMMENT ON TABLE public.member_training_journals IS '회원별 훈련 일지 — 지난 훈련 내용 빠른 열람';
COMMENT ON COLUMN public.member_training_journals.training_date IS '훈련 날짜 (KST 기준 권장)';
COMMENT ON COLUMN public.member_training_journals.body IS '그날 한 훈련 내용';

NOTIFY pgrst, 'reload schema';
