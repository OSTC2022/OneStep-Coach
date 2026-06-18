import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { ProfileEditPage } from '@/components/dashboard/profile-edit-page'

export default async function DashboardProfilePage() {
  const profile = await requireDashboardProfile()

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ProfileEditPage
        user={profile}
        backHref="/dashboard"
        backLabel="대시보드"
      />
    </div>
  )
}
