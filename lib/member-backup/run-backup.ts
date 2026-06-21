import 'server-only'

import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { isObsoleteBackupError } from '@/lib/member-backup/obsolete-errors-shared'
import { getSupabaseAdmin } from '@/lib/member-backup/supabase-admin'
import { withGoogleAccessToken } from '@/lib/google-calendar/client'
import { getGoogleBackupAuthRow } from '@/lib/member-backup/google-token'
import {
  createDriveFolder,
  downloadDriveFile,
  findDriveFileInFolder,
  findDriveFolderByName,
  MEMBER_BACKUP_DRIVE_FOLDER,
  uploadDriveFile,
} from '@/lib/google-drive/client'

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

/** DB에 남은 구버전 오류 메시지 제거 (화면에 계속 표시되는 것 방지) */
export async function clearObsoleteBackupErrors(): Promise<void> {
  const settings = await getMemberBackupSettingsRow()
  if (!isObsoleteBackupError(settings?.last_error ?? null)) return
  await upsertBackupSettings({ last_error: null })
}

export async function getMemberBackupSettingsRow() {
  const supabase = getSupabaseAdmin()
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
  const supabase = getSupabaseAdmin()
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
 * DB → Drive 백업. 기존 Drive 파일이 있으면 다운로드 후 병합(중복 제외·이력 유지)하여 업로드합니다.
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

    const syncRow = await getGoogleBackupAuthRow()
    if (!syncRow?.refresh_token) {
      throw new Error(
        'Google 계정이 연결되어 있지 않습니다. 설정 → Google 캘린더에서 연결 후 Drive 권한을 포함해 다시 연결해 주세요.',
      )
    }

    const supabase = getSupabaseAdmin()
    const { buildMemberBackupWorkbookBuffer, MEMBER_BACKUP_DRIVE_FILENAME } =
      await import('@/lib/member-backup/export-xlsx')

    const { buffer: freshBuffer, memberCount, attendanceCount } =
      await buildMemberBackupWorkbookBuffer(supabase)

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

      let uploadBuffer = freshBuffer
      if (existingFileId) {
        try {
          const existingBuffer = await downloadDriveFile(token, existingFileId)
          const { mergeBackupWorkbooks } = await import(
            '@/lib/member-backup/merge-workbook'
          )
          uploadBuffer = mergeBackupWorkbooks(existingBuffer, freshBuffer)
        } catch (downloadError) {
          console.warn(
            '[member-backup] existing file merge skipped:',
            downloadError instanceof Error ? downloadError.message : downloadError,
          )
        }
      }

      const file = await uploadDriveFile(token, {
        name: MEMBER_BACKUP_DRIVE_FILENAME,
        buffer: uploadBuffer,
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
