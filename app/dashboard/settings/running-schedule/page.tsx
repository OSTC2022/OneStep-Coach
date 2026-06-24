import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterRunningTrainingSchedulePanel } from '@/components/settings/running-schedule/center-running-training-schedule-panel'

export default async function RunningScheduleSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        챌린지 생성과 무관하게 센터 주간 러닝 훈련을 등록합니다. 저장하면 성인 회원 마이페이지에
        훈련 스케줄과 <strong>주간 훈련 참여 투표</strong> 버튼이 표시됩니다.
      </p>
      <CenterRunningTrainingSchedulePanel />
    </div>
  )
}
