import { notFound } from 'next/navigation'
import { getMemberPortalDataForStaff } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getMemberRunningLeagueHomeForStaff } from '@/lib/actions/running-league'
import { getMemberLinkedProfileRole } from '@/lib/actions/member-account'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { MemberRunningPortalAdminBanner } from '@/components/dashboard/member-running-portal-admin-banner'
import { MemberMyPage } from '@/app/dashboard/my/member-my-page'

export const dynamic = 'force-dynamic'

export default async function MemberRunningPortalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberViewer()
  const { id } = await params

  const linkedRole = await getMemberLinkedProfileRole(id)
  if (linkedRole !== 'adult_member') notFound()

  const [data, runningLeagueHome, centerTrainingSchedule] = await Promise.all([
    getMemberPortalDataForStaff(id),
    getMemberRunningLeagueHomeForStaff(id),
    getCenterRunningTrainingScheduleForMember(),
  ])

  if (!data) notFound()

  return (
    <div className="space-y-4">
      <MemberRunningPortalAdminBanner
        memberId={id}
        memberName={data.member.name}
        current="home"
      />
      <MemberMyPage
        data={data}
        role="adult_member"
        runningLeagueHome={runningLeagueHome}
        centerTrainingSchedule={centerTrainingSchedule}
        adminPreview
        runningLeagueHref={`/dashboard/members/${id}/running-portal/league`}
      />
    </div>
  )
}
