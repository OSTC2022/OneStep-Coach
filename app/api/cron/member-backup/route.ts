import { NextResponse } from 'next/server'
import { runMemberBackupToGoogleDrive } from '@/lib/member-backup/run-backup'

export const maxDuration = 120

function isAuthorized(request: Request): boolean {
  const secret =
    process.env.MEMBER_BACKUP_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runMemberBackupToGoogleDrive({ trigger: 'cron' })
  if (result.skipped) {
    return NextResponse.json({ ok: true, skipped: true, message: '오늘 자동 백업 완료' })
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
