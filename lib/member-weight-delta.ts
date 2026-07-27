import { formatBodyMetric, roundBodyMetric } from '@/lib/member-utils'

export type WeightRecordPoint = {
  recorded_at: string
  weight_kg: number
}

/** 지정 날짜 이전의 가장 최근 체중과 비교 */
export function calculateWeightDeltaKg(
  records: ReadonlyArray<WeightRecordPoint>,
  recordedAt: string,
  newWeightKg: number,
): number | null {
  const previous = [...records]
    .filter((row) => row.recorded_at < recordedAt)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]

  if (!previous) return null

  const previousWeight = roundBodyMetric(previous.weight_kg) ?? Number(previous.weight_kg)
  const nextWeight = roundBodyMetric(newWeightKg) ?? Number(newWeightKg)
  if (!Number.isFinite(previousWeight) || !Number.isFinite(nextWeight)) return null
  return Number((nextWeight - previousWeight).toFixed(1))
}

export function formatWeightDeltaLabel(deltaKg: number | null): string | null {
  if (deltaKg == null) return null
  if (deltaKg === 0) return '0kg'
  const formatted = formatBodyMetric(Math.abs(deltaKg)) ?? String(Math.abs(deltaKg))
  return deltaKg > 0 ? `+${formatted}kg` : `-${formatted}kg`
}

export function formatWeightDeltaShort(deltaKg: number | null): string | null {
  if (deltaKg == null) return null
  if (deltaKg === 0) return '0'
  const formatted = formatBodyMetric(Math.abs(deltaKg)) ?? String(Math.abs(deltaKg))
  return deltaKg > 0 ? `+${formatted}` : `-${formatted}`
}

export function formatWeightDeltaInParens(deltaKg: number | null): string | null {
  const deltaShort = formatWeightDeltaShort(deltaKg)
  if (!deltaShort) return null
  return `(${deltaShort})`
}

export function weightDeltaTextClass(deltaKg: number | null): string {
  if (deltaKg == null || deltaKg === 0) return 'text-muted-foreground'
  if (deltaKg > 0) return 'text-blue-500'
  return 'text-red-500'
}

/** 이전 키 대비 변화량 (cm) */
export function calculateHeightDeltaCm(
  previousHeightCm: number | null | undefined,
  nextHeightCm: number,
): number | null {
  const previous = roundBodyMetric(previousHeightCm)
  const next = roundBodyMetric(nextHeightCm)
  if (previous == null || next == null) return null
  return Number((next - previous).toFixed(1))
}

export function formatHeightDeltaLabel(deltaCm: number | null): string | null {
  if (deltaCm == null) return null
  if (deltaCm === 0) return '0cm'
  const formatted = formatBodyMetric(Math.abs(deltaCm)) ?? String(Math.abs(deltaCm))
  return deltaCm > 0 ? `+${formatted}cm` : `-${formatted}cm`
}

export function formatHeightDeltaShort(deltaCm: number | null): string | null {
  if (deltaCm == null) return null
  if (deltaCm === 0) return '0'
  const formatted = formatBodyMetric(Math.abs(deltaCm)) ?? String(Math.abs(deltaCm))
  return deltaCm > 0 ? `+${formatted}` : `-${formatted}`
}

export function formatHeightDeltaInParens(deltaCm: number | null): string | null {
  const deltaShort = formatHeightDeltaShort(deltaCm)
  if (!deltaShort) return null
  return `(${deltaShort})`
}

/** 지정 날짜 이전의 가장 최근 키와 비교 */
export function calculateHeightDeltaFromRecords(
  records: ReadonlyArray<{ recorded_at: string; height_cm: number | null | undefined }>,
  recordedAt: string,
  newHeightCm: number | null | undefined,
): number | null {
  if (newHeightCm == null || !Number.isFinite(Number(newHeightCm))) return null

  const previous = [...records]
    .filter(
      (row) =>
        row.recorded_at < recordedAt &&
        row.height_cm != null &&
        Number.isFinite(Number(row.height_cm)),
    )
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]

  if (!previous) return null
  return calculateHeightDeltaCm(previous.height_cm, Number(newHeightCm))
}

export function heightDeltaTextClass(deltaCm: number | null): string {
  return weightDeltaTextClass(deltaCm)
}
