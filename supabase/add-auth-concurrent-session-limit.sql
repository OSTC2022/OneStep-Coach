-- 계정당 동시 로그인 2대까지 허용
-- Supabase Dashboard > Authentication > Sessions 에서
-- "Single session per user" 옵션은 꺼 두세요 (켜져 있으면 1대만 유지됩니다).

CREATE OR REPLACE FUNCTION public.enforce_auth_concurrent_session_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  max_sessions CONSTANT INT := 2;
  excess_count INT;
BEGIN
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
