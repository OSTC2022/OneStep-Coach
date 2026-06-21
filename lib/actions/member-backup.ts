'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { getMemberBackupAdminClient } from '@/lib/member-backup/admin-client'
import { getGoogleBackupAuthRow } from '@/lib/member-backup/google-token'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar/config'
import {
  getMemberBackupSettingsRow,
  runMemberBackupToGoogleDrive,
} from '@/lib/member-backup/run-backup'

export type MemberBackupStatus = {
  configured: boolean
  googleConnected: boolean
  googleEmail: string | null
  enabled: boolean
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastFileName: string | null
  lastFileUrl: string | null
  driveFolderName: string | null
}

const SETTINGS_ID = 'default'

export async function getMemberBackupStatus(): Promise<MemberBackupStatus> {
  await requireRole(['admin'])

  const syncRow = await getGoogleBackupAuthRow()
  const settings = await getMemberBackupSettingsRow()

  return {
    configured: isGoogleCalendarConfigured(),
    googleConnected: Boolean(syncRow?.refresh_token),
    googleEmail: syncRow?.connected_email ?? null,
    enabled: settings?.enabled ?? true,
    lastRunAt: settings?.last_run_at ?? null,
    lastSuccessAt: settings?.last_success_at ?? null,
    lastError: settings?.last_error ?? null,
    lastFileName: settings?.last_file_name ?? null,
    lastFileUrl: settings?.last_file_url ?? null,
    driveFolderName: settings?.drive_folder_name ?? null,
  }
}

export async function runMemberBackupNow(): Promise<{
  ok: boolean
  error?: string
  fileName?: string
  fileUrl?: string
  memberCount?: number
  attendanceCount?: number
}> {
  await requireRole(['admin'])
  const result = await runMemberBackupToGoogleDrive({ trigger: 'manual' })
  revalidatePath('/dashboard/settings/backup')
  return result
}

export async function setMemberBackupEnabled(
  enabled: boolean,
): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = getMemberBackupAdminClient()
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

export async function downloadMemberBackupExcel(): Promise<{
  data?: string
  fileName?: string
  error?: string
}> {
  await requireRole(['admin'])
  try {
    const { buildMemberBackupWorkbookBuffer, buildMemberBackupDownloadFilename } =
      await import('@/lib/member-backup/export-xlsx')
    const { buffer, memberCount, attendanceCount } =
      await buildMemberBackupWorkbookBuffer()
    return {
      data: buffer.toString('base64'),
      fileName: buildMemberBackupDownloadFilename(),
      memberCount,
      attendanceCount,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : '엑셀 생성 중 오류가 발생했습니다.',
    }
  }
}
