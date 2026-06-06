import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { calculateMemberBmi } from '@/lib/member-utils'

export type BodyAnalysisStats = {
  latest: number | null
  first: number | null
  min: number | null
  max: number | null
  average: number | null
  delta: number | null
  recordCount: number
  latestBmi: number | null
}

export function buildBodyAnalysisStats(
  records: MemberBodyRecord[],
  heightCm?: number | null,
): BodyAnalysisStats {
  if (records.length === 0) {
    return {
      latest: null,
      first: null,
      min: null,
      max: null,
      average: null,
      delta: null,
      recordCount: 0,
      latestBmi: null,
    }
  }

  const weights = records.map((row) => row.weight_kg)
  const latest = weights.at(-1) ?? null
  const first = weights[0] ?? null
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const average = Number(
    (weights.reduce((sum, value) => sum + value, 0) / weights.length).toFixed(1),
  )
  const delta =
    latest != null && first != null
      ? Number((latest - first).toFixed(1))
      : null

  return {
    latest,
    first,
    min,
    max,
    average,
    delta,
    recordCount: records.length,
    latestBmi: calculateMemberBmi(heightCm, latest),
  }
}
