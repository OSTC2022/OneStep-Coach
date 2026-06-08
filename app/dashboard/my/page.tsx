import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const [profile, data] = await Promise.all([
    getDashboardProfile(),
    getMemberPortalData(),
  ])

  if (!data) {
    if (profile?.role === 'admin' || profile?.role === 'instructor') {
      redirect('/dashboard')
    }
    if (profile?.role === 'member' || profile?.role === 'guardian') {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  return <MemberMyPage data={data} />
}
