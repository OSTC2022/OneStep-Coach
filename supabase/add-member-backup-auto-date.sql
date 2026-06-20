-- 자정(KST) 자동 백업 — 하루 1회만 실행 (업로드 전용)

ALTER TABLE public.member_backup_settings
  ADD COLUMN IF NOT EXISTS last_auto_backup_date TEXT;

COMMENT ON COLUMN public.member_backup_settings.last_auto_backup_date IS
  'KST 기준 yyyy-MM-dd — cron 자동 백업 성공일 (하루 1회)';

NOTIFY pgrst, 'reload schema';
