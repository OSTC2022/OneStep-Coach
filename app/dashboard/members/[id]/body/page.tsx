import { notFound } from 'next/navigation'
import { getMember } from '@/lib/actions/members'
import {
  getMemberBodyRecords,
  getMemberProteinSettings,
} from '@/lib/actions/member-body-records'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { canSavePhysicalBaseline } from '@/lib/roles'
import { MemberBodyAnalysisView } from '@/components/members/member-body-analysis-view'

export default async function MemberBodyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [member, profile] = await Promise.all([getMember(id), getDashboardProfile()])
  if (!member) notFound()

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
    <div className="space-y-6 pt-12 lg:pt-0">
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
        canEditBodyBaseline={canSavePhysicalBaseline(profile?.role ?? 'member')}
      />
    </div>
  )
}
