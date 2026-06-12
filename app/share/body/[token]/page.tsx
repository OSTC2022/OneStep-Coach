import { notFound } from 'next/navigation'
import { MemberBodyAnalysisView } from '@/components/members/member-body-analysis-view'
import { getSharedBodyReportByToken } from '@/lib/actions/member-body-share'

export const metadata = {
  robots: { index: false, follow: false },
}

export default async function SharedBodyReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getSharedBodyReportByToken(token)
  if (!data) notFound()

  const { member, records, tableReady, wellnessColumnsReady, nutritionColumnsReady } =
    data

  return (
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
      readOnly
    />
  )
}
