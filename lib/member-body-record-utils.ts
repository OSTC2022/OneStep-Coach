type BootstrapCheckable = { id: string; note?: string | null }

/** 신체정보 초기 설정(가상 bootstrap) 기록 — 삭제 불가 */
export function isBootstrapBodyRecord(
  recordOrId: BootstrapCheckable | string,
): boolean {
  if (typeof recordOrId === 'string') {
    return recordOrId.startsWith('bootstrap-')
  }
  return (
    recordOrId.id.startsWith('bootstrap-') ||
    recordOrId.note === '신체정보 초기 설정'
  )
}

export function resolveBodyBaselineDate(member: {
  body_baseline_recorded_at?: string | null
  registered_at: string
}): string {
  const raw = member.body_baseline_recorded_at ?? member.registered_at
  return raw.split('T')[0]
}
