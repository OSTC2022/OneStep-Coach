import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getAdultGeneralPortalData } from '@/lib/actions/adult-general-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getCenterMarathonScheduleForMember } from '@/lib/actions/center-marathon-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import { getAdultRunningPortalDisplaySettings } from '@/lib/actions/adult-running-portal-settings'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { MemberAdultGeneralPortal } from '@/components/dashboard/member-adult-general-portal'
import { isAdultGeneralSport } from '@/lib/adult-member-programs'
import { isMemberPortalRole } from '@/lib/member-portal-routes'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const profile = await getDashboardProfile()

  if (profile?.role === 'adult_member') {
    const generalPortal = await getAdultGeneralPortalData()
    if (generalPortal) {
      return <MemberAdultGeneralPortal data={generalPortal} />
    }
  }

  const [data, runningLeagueHome, centerTrainingSchedule, marathonSchedule, portalDisplay] =
    await Promise.all([
      getMemberPortalData(),
      profile?.role === 'adult_member' ? getMemberRunningLeagueHome() : Promise.resolve(null),
      profile?.role === 'adult_member'
        ? getCenterRunningTrainingScheduleForMember()
        : Promise.resolve(null),
      profile?.role === 'adult_member'
        ? getCenterMarathonScheduleForMember()
        : Promise.resolve(null),
      profile?.role === 'adult_member'
        ? getAdultRunningPortalDisplaySettings()
        : Promise.resolve(null),
    ])

  if (!data) {
    if (profile?.role === 'admin' || profile?.role === 'instructor') {
      redirect('/dashboard')
    }
    if (profile && isMemberPortalRole(profile.role)) {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  // sport만 일반이고 role이 adult가 아닌 경우에도 체중 포털로
  if (isAdultGeneralSport(data.member.sport) && profile?.role === 'adult_member') {
    redirect('/dashboard/my/weight-portal')
  }

  return (
    <MemberMyPage
      data={data}
      role={profile?.role}
      runningLeagueHome={runningLeagueHome}
      centerTrainingSchedule={centerTrainingSchedule}
      marathonSchedule={marathonSchedule}
      portalDisplay={portalDisplay}
    />
  )
}
