import { notFound } from 'next/navigation'
import { getMemberRunningLeagueViewForStaff } from '@/lib/actions/running-league'
import { getMember } from '@/lib/actions/members'
import { getMemberLinkedProfileRole } from '@/lib/actions/member-account'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { MemberRunningPortalAdminBanner } from '@/components/dashboard/member-running-portal-admin-banner'
import { RunningLeagueMemberView } from '@/components/dashboard/running-league-member-view'

export const dynamic = 'force-dynamic'

export default async function MemberRunningPortalLeaguePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberViewer()
  const { id } = await params

  const linkedRole = await getMemberLinkedProfileRole(id)
  if (linkedRole !== 'adult_member') notFound()

  const [member, data] = await Promise.all([
    getMember(id),
    getMemberRunningLeagueViewForStaff(id),
  ])

  if (!member) notFound()

  return (
    <div className="space-y-4">
      <MemberRunningPortalAdminBanner
        memberId={id}
        memberName={member.name}
        current="league"
      />
      <RunningLeagueMemberView {...data} readOnly />
    </div>
  )
}
