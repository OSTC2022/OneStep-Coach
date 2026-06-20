import { redirect } from 'next/navigation'
import { getMemberBackupStatus } from '@/lib/actions/member-backup'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberBackupPanel } from '@/components/settings/member-backup-panel'

export const maxDuration = 120

export default async function MemberBackupSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const status = await getMemberBackupStatus()

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        자료 유실에 대비해 회원·세션·출석 데이터를 엑셀로 Google Drive에
        보관합니다.
      </p>
      <MemberBackupPanel initialStatus={status} />
    </div>
  )
}
