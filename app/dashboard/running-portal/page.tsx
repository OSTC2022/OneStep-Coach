import { redirect } from 'next/navigation'
import { getAdultRunningPortalDisplaySettings } from '@/lib/actions/adult-running-portal-settings'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getCenterMarathonScheduleForMember } from '@/lib/actions/center-marathon-schedule'
import { getMemberRunningLeagueHome } from '@/lib/actions/running-league'
import {
  getRunningPortalMemberForCurrentUser,
} from '@/lib/actions/staff-running-portal-member'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { loadMemberPortalData } from '@/lib/member-portal-data'
import { canManageAdultRunningPortal } from '@/lib/running-league/portal-manage-access'
import { MemberMyPage } from '@/app/dashboard/my/member-my-page'

export default async function StaffRunningPortalPage() {
  const profile = await requireDashboardProfile()
  if (profile.role !== 'admin' && profile.role !== 'instructor') {
    redirect('/dashboard')
  }

  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) {
    redirect('/dashboard')
  }

  const [data, runningLeagueHome, centerTrainingSchedule, marathonSchedule, portalDisplay] =
    await Promise.all([
      loadMemberPortalData(member),
      getMemberRunningLeagueHome(member.id),
      getCenterRunningTrainingScheduleForMember(),
      getCenterMarathonScheduleForMember(),
      getAdultRunningPortalDisplaySettings(),
    ])

  return (
    <MemberMyPage
      data={data}
      role="adult_member"
      runningLeagueHome={runningLeagueHome}
      centerTrainingSchedule={centerTrainingSchedule}
      marathonSchedule={marathonSchedule}
      portalDisplay={portalDisplay}
      runningLeagueHref="/dashboard/running-portal/league"
      showRunningPortal
      canManageRunningPortal={canManageAdultRunningPortal(profile)}
      showMarathonManageLink={profile.role === 'admin'}
    />
  )
}
