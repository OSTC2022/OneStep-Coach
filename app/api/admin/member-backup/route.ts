import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireBackupAdminApi } from '@/lib/member-backup/require-backup-admin'
import { runMemberBackupToGoogleDrive } from '@/lib/member-backup/run-backup'

export const maxDuration = 120

export async function POST() {
  const isAdmin = await requireBackupAdminApi()
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runMemberBackupToGoogleDrive({ trigger: 'manual' })
  revalidatePath('/dashboard/settings/backup')
  const deployRev = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
  return NextResponse.json({ ...result, deployRev }, { status: result.ok ? 200 : 500 })
}

export async function GET() {
  const isAdmin = await requireBackupAdminApi()
  if (!isAdmin) {
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
