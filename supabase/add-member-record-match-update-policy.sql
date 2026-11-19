-- 기록 맞추기 이벤트 작성자 수정 허용
-- Supabase SQL Editor에서 실행하세요.

DROP POLICY IF EXISTS member_record_match_events_update ON public.member_record_match_events;
CREATE POLICY member_record_match_events_update ON public.member_record_match_events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

NOTIFY pgrst, 'reload schema';
