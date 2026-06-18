import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { ProfileEditPage } from '@/components/dashboard/profile-edit-page'

export default async function MemberProfilePage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  return (
    <ProfileEditPage user={profile} backHref="/dashboard/my" backLabel="홈" />
  )
}
