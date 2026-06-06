import { notFound } from 'next/navigation'
import { getMember } from '@/lib/actions/members'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import { MemberBodyAnalysisView } from '@/components/members/member-body-analysis-view'

export default async function MemberBodyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const member = await getMember(id)
  if (!member) notFound()

  const { records, tableReady } = await getMemberBodyRecords(member.id, {
    weight_kg: member.weight_kg,
    height_cm: member.height_cm,
    registered_at: member.registered_at,
  })

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
      />
    </div>
  )
}
