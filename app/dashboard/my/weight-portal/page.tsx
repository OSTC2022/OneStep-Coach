import { redirect } from 'next/navigation'
import { getAdultGeneralPortalData } from '@/lib/actions/adult-general-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { MemberAdultGeneralPortal } from '@/components/dashboard/member-adult-general-portal'
import { isMemberPortalRole } from '@/lib/member-portal-routes'

export const dynamic = 'force-dynamic'

export default async function MyWeightPortalPage() {
  const profile = await getDashboardProfile()
  const data = await getAdultGeneralPortalData()

  if (!data) {
    if (profile?.role === 'adult_member') {
      redirect('/dashboard/my')
    }
    if (profile && isMemberPortalRole(profile.role)) {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  return <MemberAdultGeneralPortal data={data} />
}
