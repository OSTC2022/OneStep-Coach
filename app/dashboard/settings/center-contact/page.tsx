import { redirect } from 'next/navigation'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { CenterContactPanel } from '@/components/settings/center-contact-panel'

export default async function CenterContactSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const centerSettings = await getCenterSettings()

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        회원 마이페이지 「코치 & 센터 연락」 카드에 표시되는 전화, 카카오톡,
        SNS, 위치 정보를 설정합니다.
      </p>
      <CenterContactPanel centerSettings={centerSettings} />
    </div>
  )
}
