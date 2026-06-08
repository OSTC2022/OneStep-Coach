import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import {
  getMemberBodyRecords,
  getMemberProteinSettings,
} from '@/lib/actions/member-body-records'
import { MemberBodyAnalysisView } from '@/components/members/member-body-analysis-view'

export default async function MyBodyPage() {
  const data = await getMemberPortalData()
  if (!data) redirect('/auth/login')

  const { member } = data
  const [{ records, tableReady, wellnessColumnsReady, nutritionColumnsReady }, proteinSettings] =
    await Promise.all([
      getMemberBodyRecords(member.id, {
        weight_kg: member.weight_kg,
        height_cm: member.height_cm,
        registered_at: member.registered_at,
      }),
      getMemberProteinSettings(member.id),
    ])

  return (
    <div className="mx-auto max-w-4xl space-y-6 pt-12 lg:pt-0">
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
      />
    </div>
  )
}
