import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { getAdultGeneralPortalDataForStaff } from '@/lib/actions/adult-general-portal'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { MemberAdultGeneralPortal } from '@/components/dashboard/member-adult-general-portal'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function MemberWeightPortalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberViewer()
  const { id } = await params
  const data = await getAdultGeneralPortalDataForStaff(id)
  if (!data) notFound()

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <Eye className="h-4 w-4" />
              성인회원(일반) · 체중 관리 포털 미리보기
            </p>
            <p className="text-xs text-muted-foreground">
              {data.portal.member.name} 회원이 로그인했을 때 보이는 화면입니다. 기록
              저장은 회원 본인만 가능합니다.
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
      <MemberAdultGeneralPortal data={data} adminPreview />
    </div>
  )
}
