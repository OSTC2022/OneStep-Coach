import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
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
    redirect('/auth/login')
  }

  return <MemberMyPage data={data} />
}
