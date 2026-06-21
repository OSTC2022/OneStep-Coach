import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { profileRoleToAppRole } from '@/lib/roles'
import { runMemberBackupToGoogleDrive } from '@/lib/member-backup/run-backup'

export const maxDuration = 120

async function requireAdminApi() {
  const profile = await getDashboardProfile()
  if (!profile || profileRoleToAppRole(profile.role) !== 'admin') {
    return null
  }
  return profile
}

export async function POST() {
  const profile = await requireAdminApi()
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runMemberBackupToGoogleDrive({ trigger: 'manual' })
  revalidatePath('/dashboard/settings/backup')
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}

export async function GET() {
  const profile = await requireAdminApi()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { buildMemberBackupWorkbookBuffer, buildMemberBackupDownloadFilename } =
      await import('@/lib/member-backup/export-xlsx')
    const { buffer, memberCount, attendanceCount } =
      await buildMemberBackupWorkbookBuffer()

    return NextResponse.json({
      data: buffer.toString('base64'),
      fileName: buildMemberBackupDownloadFilename(),
      memberCount,
      attendanceCount,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : '엑셀 생성 중 오류가 발생했습니다.',
      },
      { status: 500 },
    )
  }
}
