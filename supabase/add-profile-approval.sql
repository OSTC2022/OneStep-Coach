-- 가입 승인: pending → 관리자 승인 후 접속
-- Supabase SQL Editor에서 실행

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.profiles.approval_status IS
  'pending: 승인 대기, approved: 접속 허용, rejected: 거절';

UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status IS NULL;

-- 신규 가입 시 metadata·역할에 따라 승인 상태 설정
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role TEXT;
  v_users_role TEXT;
  v_approval TEXT;
BEGIN
  v_profile_role := public.normalize_profile_role(NEW.raw_user_meta_data->>'role');
  v_users_role := public.normalize_users_table_role(v_profile_role);
  v_approval := lower(trim(COALESCE(NEW.raw_user_meta_data->>'approval_status', 'pending')));

  IF v_profile_role = 'admin' THEN
    v_approval := 'approved';
  ELSIF v_approval NOT IN ('pending', 'approved', 'rejected') THEN
    v_approval := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_profile_role,
    v_approval
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role,
    approval_status = EXCLUDED.approval_status;

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_users_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
