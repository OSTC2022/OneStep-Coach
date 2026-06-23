import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

type MemberRunningPortalAdminBannerProps = {
  memberId: string
  memberName: string
  current?: 'home' | 'league'
}

export function MemberRunningPortalAdminBanner({
  memberId,
  memberName,
  current = 'home',
}: MemberRunningPortalAdminBannerProps) {
  return (
    <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <Eye className="h-4 w-4" />
            성인회원 러닝 포털 미리보기
          </p>
          <p className="text-xs text-muted-foreground">
            {memberName} 회원이 로그인했을 때 보이는 화면입니다. 기록 입력은 회원 본인만 가능합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {current === 'league' ? (
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href={`/dashboard/members/${memberId}/running-portal`}>포털 홈</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href={`/dashboard/members/${memberId}/running-portal/league`}>
                러닝 챌린지
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link href={`/dashboard/members/${memberId}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              회원 상세
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
