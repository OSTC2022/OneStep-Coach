/** 집계 그래프 — 회원별 고유 색상 (차트·툴팁 공통) */

export const BEAT_RIVAL_CHART_COLOR = '#ef4444'

export function memberChartColorAtIndex(index: number, total: number): string {
  if (total <= 0) return '#a3e635'
  if (total === 1) return '#22d3ee'
  const spread = Math.max(total, 1)
  let hue = Math.round(200 + (index * 260) / spread) % 360
  if (hue <= 25 || hue >= 335) hue = (hue + 45) % 360
  const saturation = 68 + (index % 2) * 6
  const lightness = 54 + (index % 3) * 4
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export function buildMemberChartColorMap(
  memberIds: readonly string[],
  options?: { beatRivalMemberId?: string | null },
): Map<string, string> {
  const beatRivalId = options?.beatRivalMemberId?.trim() || null
  const unique = [...new Set(memberIds)]
    .filter((id) => id !== beatRivalId)
    .sort((a, b) => a.localeCompare(b))
  const map = new Map<string, string>()
  unique.forEach((id, index) => {
    map.set(id, memberChartColorAtIndex(index, unique.length))
  })
  return map
}

export function getMemberChartColor(
  memberId: string,
  colorMap: Map<string, string>,
  beatRivalMemberId?: string | null,
): string {
  if (beatRivalMemberId && memberId === beatRivalMemberId) {
    return BEAT_RIVAL_CHART_COLOR
  }
  return colorMap.get(memberId) ?? '#a3e635'
}
