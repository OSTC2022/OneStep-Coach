-- session_packages RLS — 관리자 수업권 등록·수정 허용
-- "row-level security policy for table session_packages" 오류 시 실행

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO service_role;

-- is_admin (fix-members-rls.sql 과 동일 — 이미 있으면 덮어씀)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "packages_admin_all" ON public.session_packages;
DROP POLICY IF EXISTS "packages_member_read" ON public.session_packages;
DROP POLICY IF EXISTS "packages_coach_read" ON public.session_packages;

CREATE POLICY "packages_admin_all" ON public.session_packages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "packages_member_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE user_id = auth.uid() OR auth_user_id = auth.uid()
    )
  );

CREATE POLICY "packages_coach_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id IN (
        SELECT id FROM public.instructors WHERE user_id = auth.uid()
      )
    )
  );

-- session_transactions (수업권 등록 시 함께 기록)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_transactions TO service_role;

ALTER TABLE public.session_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_tx_admin" ON public.session_transactions;
DROP POLICY IF EXISTS "Authenticated users full access session_transactions" ON public.session_transactions;

CREATE POLICY "session_tx_admin" ON public.session_transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
