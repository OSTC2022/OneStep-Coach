import { redirect } from 'next/navigation'
import { getCenterBoardPostsForAdmin } from '@/lib/actions/center-board'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterBoardPanel } from '@/components/settings/center-board-panel'

export default async function CenterBoardSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const posts = await getCenterBoardPostsForAdmin(undefined, 'general')

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        회원 포털 우측 상단에 표시되는 공지사항·이벤트 게시글을 관리합니다.
      </p>
      <CenterBoardPanel initialPosts={posts} />
    </div>
  )
}
