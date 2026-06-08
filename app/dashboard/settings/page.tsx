import { redirect } from 'next/navigation'
import { listPendingAccounts } from '@/lib/actions/auth-registration'
import {
  listInstructorsForSettings,
  listRegisteredAccounts,
} from '@/lib/actions/settings-accounts'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { AccountRoleManagement } from './account-role-management'

export default async function SettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const [accounts, instructors, pending] = await Promise.all([
    listRegisteredAccounts(),
    listInstructorsForSettings(),
    listPendingAccounts(),
  ])

  return (
    <AccountRoleManagement
      initialAccounts={accounts}
      initialInstructors={instructors}
      initialPending={pending}
    />
  )
}
