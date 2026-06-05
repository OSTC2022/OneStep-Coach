-- 수업권 휴지통 (소프트 삭제)
ALTER TABLE public.session_packages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS session_packages_deleted_at_idx
  ON public.session_packages (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 휴지통에 있는 수업권은 잔여 회차 합산에서 제외
CREATE OR REPLACE FUNCTION public.sync_member_remaining_sessions(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.members m
  SET remaining_sessions = COALESCE((
    SELECT SUM(sp.remaining_sessions)::INTEGER
    FROM public.session_packages sp
    WHERE sp.member_id = p_member_id
      AND sp.is_active = TRUE
      AND sp.remaining_sessions > 0
      AND sp.deleted_at IS NULL
  ), 0)
  WHERE m.id = p_member_id;
END;
$$;
