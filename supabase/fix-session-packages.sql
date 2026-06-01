-- session_packages 테이블·RLS 설정
-- 수업권 저장 실패 시 Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.session_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  price NUMERIC,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_packages TO service_role;

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_select_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_insert_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_update_authenticated" ON public.session_packages;
DROP POLICY IF EXISTS "session_packages_delete_authenticated" ON public.session_packages;

CREATE POLICY "Authenticated users full access session_packages"
  ON public.session_packages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
