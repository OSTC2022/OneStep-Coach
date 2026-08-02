-- 동시 로그인 한도: 관리자·강사 4대, 그 외 회원 1대
-- Supabase Dashboard > Authentication 에서 "Single session per user" 는 꺼 두세요.

CREATE OR REPLACE FUNCTION public.enforce_auth_concurrent_session_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  max_sessions INT := 1;
  user_role TEXT;
  excess_count INT;
BEGIN
  SELECT p.role::text
    INTO user_role
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF user_role IN ('admin', 'instructor', 'coach') THEN
    max_sessions := 4;
  ELSE
    max_sessions := 1;
  END IF;

  SELECT COUNT(*) - max_sessions
    INTO excess_count
  FROM auth.sessions
  WHERE user_id = NEW.user_id;

  IF excess_count > 0 THEN
    DELETE FROM auth.sessions
    WHERE id IN (
      SELECT id
      FROM auth.sessions
      WHERE user_id = NEW.user_id
        AND id <> NEW.id
      ORDER BY created_at ASC
      LIMIT excess_count
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_auth_concurrent_session_limit_trigger ON auth.sessions;

CREATE TRIGGER enforce_auth_concurrent_session_limit_trigger
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_auth_concurrent_session_limit();

COMMENT ON FUNCTION public.enforce_auth_concurrent_session_limit() IS
  '관리자/강사 최대 4세션, 그 외 회원 1세션';
