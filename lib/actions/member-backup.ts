'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { getGoogleBackupAuthRow } from '@/lib/member-backup/google-token'
import { isObsoleteBackupError } from '@/lib/member-backup/obsolete-errors-shared'
import { getSupabaseAdmin } from '@/lib/member-backup/supabase-admin'
import {
  clearObsoleteBackupErrors,
  getMemberBackupSettingsRow,
} from '@/lib/member-backup/run-backup'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import type { MemberBackupStatus } from '@/lib/member-backup/types'

export type { MemberBackupStatus } from '@/lib/member-backup/types'

const SETTINGS_ID = 'default'

export async function getMemberBackupStatus(): Promise<MemberBackupStatus> {
  await requireRole(['admin'])

  await clearObsoleteBackupErrors()

  const syncRow = await getGoogleBackupAuthRow()
  const settings = await getMemberBackupSettingsRow()

  const lastError = settings?.last_error ?? null

  return {
    configured: isGoogleCalendarConfigured(),
    googleConnected: Boolean(syncRow?.refresh_token),
    googleEmail: syncRow?.connected_email ?? null,
    enabled: settings?.enabled ?? true,
    lastRunAt: settings?.last_run_at ?? null,
    lastSuccessAt: settings?.last_success_at ?? null,
    lastError: isObsoleteBackupError(lastError) ? null : lastError,
    lastFileName: settings?.last_file_name ?? null,
    lastFileUrl: settings?.last_file_url ?? null,
    driveFolderName: settings?.drive_folder_name ?? null,
  }
}

export async function setMemberBackupEnabled(
  enabled: boolean,
): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('member_backup_settings').upsert(
    {
      id: SETTINGS_ID,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings/backup')
  return {}
}
