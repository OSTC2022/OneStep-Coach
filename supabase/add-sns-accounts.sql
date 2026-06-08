-- 회원 프로필 확장 (학교/소속팀 + 카카오톡·인스타그램)

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS kakao_id TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS instagram_id TEXT;

ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS kakao_id TEXT;
ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS instagram_id TEXT;
ALTER TABLE public.instructors ADD COLUMN IF NOT EXISTS blog_url TEXT;

CREATE TABLE IF NOT EXISTS public.center_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT '센터',
  kakao_id TEXT,
  instagram_id TEXT,
  blog_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.center_settings (id, name)
VALUES ('default', '센터')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.center_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "center_settings_read" ON public.center_settings;
CREATE POLICY "center_settings_read" ON public.center_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "center_settings_admin_write" ON public.center_settings;
CREATE POLICY "center_settings_admin_write" ON public.center_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.center_settings TO authenticated;
GRANT ALL ON TABLE public.center_settings TO authenticated;
GRANT ALL ON TABLE public.center_settings TO service_role;

DROP POLICY IF EXISTS "members_self_update" ON public.members;
CREATE POLICY "members_self_update" ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
