-- 이겨라 대상 회원 (성인 러닝 포털 랭킹 강조)
ALTER TABLE public.running_leagues
  ADD COLUMN IF NOT EXISTS beat_rival_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_running_leagues_beat_rival_member
  ON public.running_leagues (beat_rival_member_id)
  WHERE beat_rival_member_id IS NOT NULL;
