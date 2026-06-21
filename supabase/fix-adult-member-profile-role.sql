-- adult_member 권한 정규화 (Auth 트리거·복구 UPDATE용)

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role = 'instructor' THEN
    RETURN 'coach';
  END IF;
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian', 'adult_member') THEN
    RETURN v_role;
  END IF;
  RETURN 'member';
END;
$$;

NOTIFY pgrst, 'reload schema';
