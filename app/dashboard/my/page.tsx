import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getAdultGeneralPortalData } from '@/lib/actions/adult-general-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getCenterMarathonScheduleForMember } from '@/lib/actions/center-marathon-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import { getAdultRunningPortalDisplaySettings } from '@/lib/actions/adult-running-portal-settings'
import { getYouthAthleticsPbBundle } from '@/lib/actions/youth-athletics-pb'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { MemberAdultGeneralPortal } from '@/components/dashboard/member-adult-general-portal'
import { YouthAthleticsPortal } from '@/components/dashboard/youth-athletics-portal'
import { isAdultGeneralSport, isAdultRunningSport } from '@/lib/adult-member-programs'
import { isYouthAthleticsClassSport } from '@/lib/youth-athletics-class'
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

  const portalData = await getMemberPortalData()
  const youthAthletics = isYouthAthleticsClassSport(portalData?.member.sport)
  const useAdultRunningPortal =
    !youthAthletics &&
    (profile?.role === 'adult_member' ||
      isAdultRunningSport(portalData?.member.sport))

  const [
    data,
    runningLeagueHome,
    centerTrainingSchedule,
    marathonSchedule,
    portalDisplay,
    youthPbBundle,
  ] = await Promise.all([
      Promise.resolve(portalData),
      useAdultRunningPortal ? getMemberRunningLeagueHome() : Promise.resolve(null),
      youthAthletics || useAdultRunningPortal
        ? getCenterRunningTrainingScheduleForMember(
            youthAthletics ? 'youth_athletics' : 'adult_running',
          )
        : Promise.resolve(null),
      useAdultRunningPortal
        ? getCenterMarathonScheduleForMember()
        : Promise.resolve(null),
      useAdultRunningPortal
        ? getAdultRunningPortalDisplaySettings()
        : Promise.resolve(null),
      youthAthletics
        ? getYouthAthleticsPbBundle(portalData?.member.id)
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

  if (youthAthletics) {
    return (
      <YouthAthleticsPortal
        data={data}
        centerTrainingSchedule={centerTrainingSchedule}
        pbBundle={youthPbBundle}
      />
    )
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
