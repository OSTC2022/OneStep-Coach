-- 회원 본인 신체·컨디션 기록 RLS
-- supabase/add-member-body-records.sql 실행 후 적용

DROP POLICY IF EXISTS "member_body_records_self_read" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_insert" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_update" ON public.member_body_records;
DROP POLICY IF EXISTS "member_body_records_self_delete" ON public.member_body_records;

CREATE POLICY "member_body_records_self_read" ON public.member_body_records
  FOR SELECT TO authenticated
  USING (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_insert" ON public.member_body_records
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_update" ON public.member_body_records
  FOR UPDATE TO authenticated
  USING (
    member_id = public.current_member_id()
  )
  WITH CHECK (
    member_id = public.current_member_id()
  );

CREATE POLICY "member_body_records_self_delete" ON public.member_body_records
  FOR DELETE TO authenticated
  USING (
    member_id = public.current_member_id()
  );
