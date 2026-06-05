-- 회원 휴지통(소프트 삭제) 컬럼
-- Supabase Dashboard > SQL Editor에서 실행

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS members_deleted_at_idx
  ON public.members (deleted_at)
  WHERE deleted_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
