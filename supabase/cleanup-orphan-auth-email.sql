-- Auth 사용자 삭제 후 남은 public 데이터 정리
-- 아래 'your@email.com' 을 실제 이메일로 바꾼 뒤 Supabase SQL Editor에서 실행

DO $$
DECLARE
  target_email TEXT := 'your@email.com';
BEGIN
  UPDATE public.members
  SET auth_user_id = NULL, user_id = NULL
  WHERE invite_email ILIKE target_email
     OR auth_user_id IN (
       SELECT id FROM public.profiles WHERE email ILIKE target_email
     );

  UPDATE public.members
  SET auth_user_id = NULL, user_id = NULL
  WHERE auth_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth_user_id);

  DELETE FROM public.profiles p
  WHERE p.email ILIKE target_email
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

  DELETE FROM public.users u
  WHERE u.email ILIKE target_email
    AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id);
END $$;
