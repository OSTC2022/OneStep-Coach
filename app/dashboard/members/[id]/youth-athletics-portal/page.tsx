import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { getMemberPortalDataForStaff } from '@/lib/actions/member-portal'
import { getCenterRunningTrainingScheduleForMember } from '@/lib/actions/center-running-training-schedule'
import { getYouthAthleticsPbBundle } from '@/lib/actions/youth-athletics-pb'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { isYouthAthleticsClassSport } from '@/lib/youth-athletics-class'
import { YouthAthleticsPortal } from '@/components/dashboard/youth-athletics-portal'
import { Button } from '@/components/ui/button'
import {
  YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL,
  YOUTH_ATHLETICS_PORTAL_TITLE,
} from '@/lib/youth-athletics-class'

export const dynamic = 'force-dynamic'

export default async function MemberYouthAthleticsPortalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberViewer()
  const { id } = await params

  const [data, centerTrainingSchedule, pbBundle] = await Promise.all([
    getMemberPortalDataForStaff(id),
    getCenterRunningTrainingScheduleForMember('youth_athletics'),
    getYouthAthleticsPbBundle(id),
  ])

  if (!data || !isYouthAthleticsClassSport(data.member.sport)) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <Eye className="h-4 w-4" />
              {YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL} 포털 미리보기
            </p>
            <p className="text-xs text-muted-foreground">
              {data.member.name} 회원의 {YOUTH_ATHLETICS_PORTAL_TITLE} 화면입니다.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link href={`/dashboard/members/${id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              회원 상세
            </Link>
          </Button>
        </div>
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
