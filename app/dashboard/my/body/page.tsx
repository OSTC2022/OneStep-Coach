import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import {
  getMemberBodyRecords,
  getMemberProteinSettings,
} from '@/lib/actions/member-body-records'
import { isMemberPortalRole } from '@/lib/member-portal-routes'
import { MemberBodyAnalysisView } from '@/components/members/member-body-analysis-view'

export default async function MyBodyPage() {
  const [profile, data] = await Promise.all([
    getDashboardProfile(),
    getMemberPortalData(),
  ])
  if (!data) {
    if (profile && isMemberPortalRole(profile.role)) {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  const { member } = data
  const [{ records, tableReady, wellnessColumnsReady, nutritionColumnsReady }, proteinSettings] =
    await Promise.all([
      getMemberBodyRecords(member.id, {
        weight_kg: member.weight_kg,
        height_cm: member.height_cm,
        registered_at: member.registered_at,
        body_baseline_recorded_at: member.body_baseline_recorded_at,
      }),
      getMemberProteinSettings(member.id),
    ])

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <MemberBodyAnalysisView
        member={{
          id: member.id,
          name: member.name,
          sport: member.sport,
          height_cm: member.height_cm,
          weight_kg: member.weight_kg,
          bmi: member.bmi,
        }}
        initialRecords={records}
        tableReady={tableReady}
        wellnessColumnsReady={wellnessColumnsReady}
        nutritionColumnsReady={nutritionColumnsReady}
        proteinSettings={proteinSettings}
        backHref="/dashboard/my"
        reportVariant={profile?.role === 'adult_member' ? 'adult' : 'athlete'}
      />
    </div>
  )
}
