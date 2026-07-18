-- 수업현황 옆 스태프 알림장 (메모)
-- admin / coach(instructor) 공유

CREATE TABLE IF NOT EXISTS public.staff_memo_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_memo_notes_updated_idx
  ON public.staff_memo_notes (updated_at DESC);

CREATE INDEX IF NOT EXISTS staff_memo_notes_member_name_idx
  ON public.staff_memo_notes (member_name);

CREATE INDEX IF NOT EXISTS staff_memo_notes_member_id_idx
  ON public.staff_memo_notes (member_id)
  WHERE member_id IS NOT NULL;

ALTER TABLE public.staff_memo_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_memo_notes_staff_all ON public.staff_memo_notes;
CREATE POLICY staff_memo_notes_staff_all ON public.staff_memo_notes
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_coach())
  WITH CHECK (public.is_admin() OR public.is_coach());

COMMENT ON TABLE public.staff_memo_notes IS '수업현황 스태프 알림장 메모';
COMMENT ON COLUMN public.staff_memo_notes.member_name IS '표시·검색용 이름 (미등록 이름도 가능)';
COMMENT ON COLUMN public.staff_memo_notes.body IS '알림 내용';

NOTIFY pgrst, 'reload schema';
