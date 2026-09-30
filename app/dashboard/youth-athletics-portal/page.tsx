import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getYouthAthleticsPbBundle } from '@/lib/actions/youth-athletics-pb'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { loadMemberPortalData } from '@/lib/member-portal-data'
import { YouthAthleticsPortal } from '@/components/dashboard/youth-athletics-portal'
import {
  YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL,
  YOUTH_ATHLETICS_PORTAL_TITLE,
} from '@/lib/youth-athletics-class'

export const dynamic = 'force-dynamic'

export default async function StaffYouthAthleticsPortalPage() {
  const profile = await requireDashboardProfile()
  if (profile.role !== 'admin' && profile.role !== 'instructor') {
    redirect('/dashboard')
  }

  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) {
    redirect('/dashboard')
  }

  const [data, centerTrainingSchedule, pbBundle] = await Promise.all([
    loadMemberPortalData(member),
    getCenterRunningTrainingScheduleForMember('youth_athletics'),
    getYouthAthleticsPbBundle(member.id),
  ])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <Eye className="h-4 w-4" />
          {YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL} 포털 미리보기
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {YOUTH_ATHLETICS_PORTAL_TITLE} 화면입니다. 스케줄 대리 참여는 가능하며, PB 입력은
          회원 본인만 가능합니다.
        </p>
      </div>
      <YouthAthleticsPortal
        data={data}
        centerTrainingSchedule={centerTrainingSchedule}
        pbBundle={pbBundle}
        adminPreview
        canStaffProxySignup
      />
    </div>
  )
}
