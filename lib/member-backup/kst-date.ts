/** 한국 시간(Asia/Seoul) 기준 yyyy-MM-dd */
export function getKstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getKstClockMinutes(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function parseStartMinutes(startTime: string | null | undefined): number | null {
  if (!startTime) return null
  const [hours, minutes] = startTime.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

/** 수업 예정 시각(한국 시간)이 이미 지났는지 — 매일·매주·매월 등 미래 occurrence 제외용 */
export function isLessonSchedulePassedInKst(
  lessonDate: string,
  startTime: string | null | undefined,
  asOf = new Date(),
): boolean {
  const date = lessonDate.split('T')[0]
  const today = getKstDateKey(asOf)
  if (date < today) return true
  if (date > today) return false

  const startMinutes = parseStartMinutes(startTime)
  if (startMinutes === null) return true

  return startMinutes <= getKstClockMinutes(asOf)
}
