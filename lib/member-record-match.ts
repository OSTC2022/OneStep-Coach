/** 완주 기록 입력. 45:20 또는 1:45:20 */
export function parseFinishTime(value: string): number | null {
  const parts = value.trim().split(':').map((part) => part.trim())
  if (parts.length < 2 || parts.length > 3) return null
  if (parts.some((part) => !/^\d+$/.test(part))) return null

  const numbers = parts.map((part) => Number(part))
  const hours = numbers.length === 3 ? numbers[0] : 0
  const minutes = numbers.length === 3 ? numbers[1] : numbers[0]
  const seconds = numbers.length === 3 ? numbers[2] : numbers[1]
  if (hours > 12 || minutes > 59 || seconds > 59) return null

  const total = hours * 3600 + minutes * 60 + seconds
  if (total <= 0 || total > 12 * 3600) return null
  return total
}

export function formatFinishTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${minutes}:${ss}`
}

export function formatTimeGap(seconds: number): string {
  const gap = Math.abs(Math.round(seconds))
  if (gap === 0) return '정확히 맞춤'
  return `${formatFinishTime(gap)} 차이`
}
