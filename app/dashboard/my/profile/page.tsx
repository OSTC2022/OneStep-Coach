import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMyProfileSettings } from '@/lib/actions/profile-settings'
import { ProfileEditPage } from '@/components/dashboard/profile-edit-page'

export default async function MemberProfilePage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  const settings = await getMyProfileSettings()

  return (
    <ProfileEditPage
      user={profile}
      backHref="/dashboard/my"
      backLabel="홈"
      memberGender={settings?.gender ?? null}
      showMemberGender={profile.role === 'adult_member'}
    />
  )
}
