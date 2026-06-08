import { redirect } from 'next/navigation'
import { listPendingAccounts } from '@/lib/actions/auth-registration'
import {
  listInstructorsForSettings,
  listRegisteredAccounts,
} from '@/lib/actions/settings-accounts'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { AccountRoleManagement } from './account-role-management'
import { CenterSnsPanel } from '@/components/settings/center-sns-panel'

export default async function SettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const [accounts, instructors, pending, centerSettings] = await Promise.all([
    listRegisteredAccounts(),
    listInstructorsForSettings(),
    listPendingAccounts(),
    getCenterSettings(),
  ])

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">설정</h1>
        <p className="text-muted-foreground mt-1">
          가입 승인, 계정 생성, 강사·학부모 권한을 앱에서 직접 관리합니다.
        </p>
      </div>

      <CenterSnsPanel centerSettings={centerSettings} />

      <AccountRoleManagement
        initialAccounts={accounts}
        initialInstructors={instructors}
        initialPending={pending}
      />
    </div>
  )
}
