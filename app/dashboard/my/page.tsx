import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import { getAdultRunningPortalDisplaySettings } from '@/lib/actions/adult-running-portal-settings'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { isMemberPortalRole } from '@/lib/member-portal-routes'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const profile = await getDashboardProfile()
  const [data, runningLeagueHome, centerTrainingSchedule, portalDisplay] = await Promise.all([
    getMemberPortalData(),
    profile?.role === 'adult_member' ? getMemberRunningLeagueHome() : Promise.resolve(null),
    profile?.role === 'adult_member'
      ? getCenterRunningTrainingScheduleForMember()
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

  return (
    <MemberMyPage
      data={data}
      role={profile?.role}
      runningLeagueHome={runningLeagueHome}
      centerTrainingSchedule={centerTrainingSchedule}
      portalDisplay={portalDisplay}
    />
  )
}
