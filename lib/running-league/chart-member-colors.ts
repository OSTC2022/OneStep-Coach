/** 집계 그래프 — 회원별 고유 색상 (차트·툴팁 공통) */

export const BEAT_RIVAL_CHART_COLOR = '#ef4444'

export function memberChartColorAtIndex(index: number, total: number): string {
  if (total <= 0) return '#a3e635'
  if (total === 1) return '#a3e635'
  const hue = Math.round((index * 360) / total) % 360
  const saturation = 68 + (index % 2) * 6
  const lightness = 54 + (index % 3) * 4
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export function buildMemberChartColorMap(memberIds: readonly string[]): Map<string, string> {
  const unique = [...new Set(memberIds)].sort((a, b) => a.localeCompare(b))
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
