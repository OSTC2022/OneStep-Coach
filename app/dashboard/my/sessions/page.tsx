import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { MemberSessionsPage } from '../member-sessions-page'

export default async function MySessionsPage() {
  const [profile, data] = await Promise.all([
    getDashboardProfile(),
    getMemberPortalData(),
  ])

  if (!data) {
    if (profile?.role === 'member' || profile?.role === 'guardian') {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  return <MemberSessionsPage data={data} />
}
