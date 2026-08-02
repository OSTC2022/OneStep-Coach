import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterMarathonSchedulePanel } from '@/components/settings/marathon-schedule/center-marathon-schedule-panel'

export default async function MarathonScheduleSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        마라톤·대회 일정을 등록합니다. 저장하면 성인 회원 마이페이지와 내 러닝 포털에
        <strong> DAY 표기</strong>·참가신청 링크·참여 버튼이 표시됩니다.
      </p>
      <CenterMarathonSchedulePanel />
    </div>
  )
}
