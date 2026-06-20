-- 회원 데이터 Google Drive 백업 설정

CREATE TABLE IF NOT EXISTS public.member_backup_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT true,
  drive_folder_id TEXT,
  drive_folder_name TEXT,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_file_id TEXT,
  last_file_name TEXT,
  last_file_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_backup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_backup_settings_admin_all ON public.member_backup_settings;
CREATE POLICY member_backup_settings_admin_all ON public.member_backup_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.member_backup_settings (id, enabled)
VALUES ('default', true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.member_backup_settings IS '회원·세션·출석 Excel Google Drive 백업 상태';

NOTIFY pgrst, 'reload schema';
