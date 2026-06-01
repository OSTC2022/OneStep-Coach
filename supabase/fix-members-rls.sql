-- members 테이블 RLS·권한 수정
-- "row-level security" / 데이터베이스 권한 오류 시 Supabase SQL Editor에서 실행
-- 기존 테이블·데이터는 유지됩니다.

-- 1) authenticated 역할에 테이블 접근 권한 부여
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.members TO service_role;

-- 2) RLS 활성화
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 3) 기존 정책 제거 (이름이 다를 수 있어 members 관련 정책 전부 재생성)
DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.members;
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_insert_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_update_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_delete_authenticated" ON public.members;

-- 4) 로그인한 사용자(admin/강사) 전체 CRUD 허용
CREATE POLICY "Authenticated users full access members"
  ON public.members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
