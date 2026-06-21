import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireBackupAdminApi } from '@/lib/member-backup/require-backup-admin'
import {
  clearObsoleteBackupErrors,
  runMemberBackupToGoogleDrive,
} from '@/lib/member-backup/run-backup'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const BACKUP_API_REV = 'drive-backup-v4'

function getBackupRouteSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function backupMeta() {
  return {
    deployRev: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    backupApiRev: BACKUP_API_REV,
  }
}

export async function POST() {
  const isAdmin = await requireBackupAdminApi()
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    getBackupRouteSupabase()
    await clearObsoleteBackupErrors()

    const result = await runMemberBackupToGoogleDrive({ trigger: 'manual' })
    revalidatePath('/dashboard/settings/backup')

    return NextResponse.json(
      { ...result, ...backupMeta() },
      { status: result.ok ? 200 : 500 },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '백업 중 알 수 없는 오류가 발생했습니다.'
    return NextResponse.json(
      { ok: false, error: message, ...backupMeta() },
      { status: 500 },
    )
  }
}

export async function GET() {
  const isAdmin = await requireBackupAdminApi()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getBackupRouteSupabase()
    await clearObsoleteBackupErrors()

    const { buildMemberBackupWorkbookBuffer, buildMemberBackupDownloadFilename } =
      await import('@/lib/member-backup/export-xlsx')
    const { buffer, memberCount, attendanceCount } =
      await buildMemberBackupWorkbookBuffer(supabase)

    return NextResponse.json({
      ok: true,
      data: buffer.toString('base64'),
      fileName: buildMemberBackupDownloadFilename(),
      memberCount,
      attendanceCount,
      ...backupMeta(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : '엑셀 생성 중 오류가 발생했습니다.',
        ...backupMeta(),
      },
      { status: 500 },
    )
  }
}
