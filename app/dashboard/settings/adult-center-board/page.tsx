import { redirect } from 'next/navigation'
import { getCenterBoardPostsForAdmin } from '@/lib/actions/center-board'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterBoardPanel } from '@/components/settings/center-board-panel'

export default async function AdultCenterBoardSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const posts = await getCenterBoardPostsForAdmin(undefined, 'adult')

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        <strong>성인회원</strong> 권한 계정 포털에만 표시되는 공지·이벤트를 관리합니다.
        이벤트 탭에서 <strong>원스텝 러닝 리그</strong> 버튼으로 4주 리그 안내를 한 번에
        등록할 수 있습니다. 참가자·점수·순위 운영은{' '}
        <strong>설정 → 러닝 리그 운영</strong>에서 진행합니다.
      </p>
      <CenterBoardPanel
        initialPosts={posts}
        audience="adult"
        enableMileageChallenge
      />
    </div>
  )
}
