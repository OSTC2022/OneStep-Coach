import 'server-only'

import {
  buildMemberBackupWorkbookBuffer,
  MEMBER_BACKUP_DRIVE_FILENAME,
} from '@/lib/member-backup/export-xlsx'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { withGoogleAccessToken } from '@/lib/google-calendar/client'
import { getGoogleCalendarSyncRow } from '@/lib/google-calendar/sync'
import {
  createDriveFolder,
  findDriveFileInFolder,
  findDriveFolderByName,
  MEMBER_BACKUP_DRIVE_FOLDER,
  uploadDriveFile,
} from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'

export type MemberBackupTrigger = 'manual' | 'cron'

export type MemberBackupRunResult = {
  ok: boolean
  skipped?: boolean
  fileName?: string
  fileUrl?: string
  memberCount?: number
  attendanceCount?: number
  error?: string
}

const SETTINGS_ID = 'default'

export async function getMemberBackupSettingsRow() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('member_backup_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .maybeSingle()

  if (error) {
    console.error('[member-backup] settings read', error.message)
    return null
  }
  return data
}

async function upsertBackupSettings(
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('member_backup_settings').upsert(
    {
      id: SETTINGS_ID,
      updated_at: now,
      ...patch,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

async function ensureDriveFolder(
  accessToken: string,
  knownFolderId?: string | null,
): Promise<{ id: string; name: string }> {
  if (knownFolderId) {
    return { id: knownFolderId, name: MEMBER_BACKUP_DRIVE_FOLDER }
  }
  const existing = await findDriveFolderByName(accessToken, MEMBER_BACKUP_DRIVE_FOLDER)
  if (existing) return { id: existing.id, name: existing.name }
  const created = await createDriveFolder(accessToken, MEMBER_BACKUP_DRIVE_FOLDER)
  return { id: created.id, name: created.name }
}

/**
 * DB → Drive 단방향 업로드만 수행합니다. Drive 파일을 읽어 앱 데이터를 바꾸지 않습니다.
 */
export async function runMemberBackupToGoogleDrive(options?: {
  trigger?: MemberBackupTrigger
}): Promise<MemberBackupRunResult> {
  const trigger = options?.trigger ?? 'manual'
  const kstToday = getKstDateKey()
  const startedAt = new Date().toISOString()
  await upsertBackupSettings({ last_run_at: startedAt, last_error: null })

  try {
    const settings = await getMemberBackupSettingsRow()
    if (settings && settings.enabled === false) {
      return { ok: false, error: '자동 백업이 비활성화되어 있습니다.' }
    }

    if (
      trigger === 'cron' &&
      settings?.last_auto_backup_date === kstToday
    ) {
      return { ok: true, skipped: true }
    }

    const syncRow = await getGoogleCalendarSyncRow()
    if (!syncRow?.refresh_token) {
      throw new Error(
        'Google 계정이 연결되어 있지 않습니다. 설정 → Google 캘린더에서 연결 후 Drive 권한을 포함해 다시 연결해 주세요.',
      )
    }

    const { buffer, memberCount, attendanceCount } =
      await buildMemberBackupWorkbookBuffer()

    const result = await withGoogleAccessToken(syncRow.refresh_token, async (token) => {
      const folder = await ensureDriveFolder(token, settings?.drive_folder_id)

      let existingFileId = settings?.last_file_id ?? null
      if (!existingFileId) {
        const found = await findDriveFileInFolder(
          token,
          folder.id,
          MEMBER_BACKUP_DRIVE_FILENAME,
        )
        existingFileId = found?.id ?? null
      }

      const file = await uploadDriveFile(token, {
        name: MEMBER_BACKUP_DRIVE_FILENAME,
        buffer,
        folderId: folder.id,
        existingFileId,
      })

      return { folder, file }
    })

    const successAt = new Date().toISOString()
    await upsertBackupSettings({
      last_success_at: successAt,
      last_error: null,
      drive_folder_id: result.folder.id,
      drive_folder_name: result.folder.name,
      last_file_id: result.file.id,
      last_file_name: result.file.name,
      last_file_url: result.file.webViewLink ?? null,
      ...(trigger === 'cron' ? { last_auto_backup_date: kstToday } : {}),
    })

    return {
      ok: true,
      fileName: result.file.name,
      fileUrl: result.file.webViewLink ?? undefined,
      memberCount,
      attendanceCount,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '백업 중 알 수 없는 오류가 발생했습니다.'
    await upsertBackupSettings({ last_error: message })
    return { ok: false, error: message }
  }
}
