import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterRunningTrainingSchedulePanel } from '@/components/settings/running-schedule/center-running-training-schedule-panel'

export default async function YouthAthleticsScheduleSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        육상선수반 주간 훈련 일정을 등록합니다. 저장하면{' '}
        <strong>회원(육상선수반)</strong> 마이페이지의{' '}
        <strong>육상선수반 스케줄</strong>에 표시되고, 주간 참여 투표를 할 수 있습니다.
        성인 러닝 스케줄과는 별도로 관리됩니다.
      </p>
      <CenterRunningTrainingSchedulePanel audience="youth_athletics" />
    </div>
  )
}
