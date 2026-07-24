import { notFound } from 'next/navigation'
import { getMember } from '@/lib/actions/members'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import { MemberWeightPageView } from '@/components/members/member-weight-page-view'

export default async function MemberWeightPage({
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
    body_baseline_recorded_at: member.body_baseline_recorded_at,
  })

  return (
    <MemberWeightPageView
      memberId={member.id}
      memberName={member.name}
      memberSport={member.sport}
      memberHeightCm={member.height_cm}
      initialRecords={records}
      tableReady={tableReady}
    />
  )
}
