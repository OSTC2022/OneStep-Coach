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

  const member = await getRunningPortalMemberForCurrentUser().catch((error) => {
    console.error('StaffRunningPortalPage.member', error)
    return null
  })
  if (!member) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 py-10">
        <h1 className="text-xl font-bold">러닝 포털을 열지 못했습니다</h1>
        <p className="text-sm text-muted-foreground">
          연결된 회원 프로필이 없습니다. 잠시 후 다시 열어 주세요.
        </p>
      </div>
    )
  }

  const [data, runningLeagueHome, centerTrainingSchedule, marathonSchedule, portalDisplay] =
    await Promise.all([
      loadMemberPortalData(member).catch((error) => {
        console.error('StaffRunningPortalPage.portalData', error)
        return null
      }),
      getMemberRunningLeagueHome(member.id),
      getCenterRunningTrainingScheduleForMember('adult_running').catch((error) => {
        console.error('StaffRunningPortalPage.schedule', error)
        return null
      }),
      getCenterMarathonScheduleForMember().catch((error) => {
        console.error('StaffRunningPortalPage.marathon', error)
        return null
      }),
      getAdultRunningPortalDisplaySettings().catch((error) => {
        console.error('StaffRunningPortalPage.display', error)
        return null
      }),
    ])

  if (!data) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 py-10">
        <h1 className="text-xl font-bold">러닝 포털을 열지 못했습니다</h1>
        <p className="text-sm text-muted-foreground">
          회원 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.
        </p>
      </div>
    )
  }

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
      canStaffManageAttendance
      showMarathonManageLink={profile.role === 'admin'}
      canPinMarathonEvents={profile.role === 'admin' || profile.role === 'instructor'}
    />
  )
}
