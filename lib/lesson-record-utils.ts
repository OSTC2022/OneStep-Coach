import { format, parseISO } from 'date-fns'

export type LessonNumberingRow = {
  id: string
  lesson_date: string
  start_time: string | null
  created_at: string
  lesson_no: number | null
  session_deducted: boolean
  attendance_status: string
}

export function countsTowardSessionNumber(lesson: Pick<LessonNumberingRow, 'session_deducted' | 'attendance_status'>) {
  return (
    lesson.session_deducted ||
    lesson.attendance_status === 'present' ||
    lesson.attendance_status === 'makeup'
  )
}

/** 수업권 차감된 수업만 회차 집계 (총·잔여와 연동) */
export function countsTowardPackageSession(
  lesson: Pick<LessonNumberingRow, 'session_deducted'>,
) {
  return lesson.session_deducted
}

export function buildLessonSessionNumberMap(
  lessons: LessonNumberingRow[],
  options?: { packageOnly?: boolean },
) {
  const sorted = [...lessons].sort((a, b) => {
    const dateCmp = a.lesson_date.localeCompare(b.lesson_date)
    if (dateCmp !== 0) return dateCmp
    const startCmp = (a.start_time ?? '').localeCompare(b.start_time ?? '')
    if (startCmp !== 0) return startCmp
    return a.created_at.localeCompare(b.created_at)
  })

  const map = new Map<string, number>()
  let counter = 0
  const shouldCount = options?.packageOnly
    ? countsTowardPackageSession
    : countsTowardSessionNumber

  for (const lesson of sorted) {
    if (!shouldCount(lesson)) continue
    counter += 1
    map.set(lesson.id, counter)
  }

  return map
}

export type SessionPackageTally = {
  total: number
  remaining: number
  used: number
}

function sumSessionPackages(
  packages: Array<{ total_sessions: number; remaining_sessions: number }>,
) {
  const total = packages.reduce((sum, pkg) => sum + pkg.total_sessions, 0)
  const remaining = packages.reduce((sum, pkg) => sum + pkg.remaining_sessions, 0)
  return {
    total,
    remaining,
    used: Math.max(0, total - remaining),
  }
}

/** 등록된 수업권 전체 합산 (추가·복수 수업권 대비) */
export function tallySessionPackages(
  packages: Array<{ total_sessions: number; remaining_sessions: number }>,
): SessionPackageTally {
  return sumSessionPackages(packages)
}

/** 활성 수업권만 합산 */
export function tallyActiveSessionPackages(
  packages: Array<{
    is_active: boolean
    total_sessions: number
    remaining_sessions: number
  }>,
): SessionPackageTally {
  return sumSessionPackages(packages.filter((pkg) => pkg.is_active))
}

/** 수업권 내역 합산 — 잔여는 각 수업권 remaining_sessions 합 */
export function linkPackageTallyToSessions(
  packages: Array<{ total_sessions: number; remaining_sessions: number }>,
  _sessionNumberByLessonId?: Record<string, number> | Map<string, number>,
): SessionPackageTally {
  const base = tallySessionPackages(packages)
  return {
    total: base.total,
    remaining: base.remaining,
    used: Math.max(0, base.total - base.remaining),
  }
}

/** 최근 수업 기록 표시용 — 날짜 내림차순, 같은 날은 회차·시작 시각 순 */
export function sortLessonsForRecentDisplay<
  T extends LessonNumberingRow & { id: string },
>(
  lessons: T[],
  sessionNumberByLessonId: Record<string, number> | Map<string, number>,
): T[] {
  const sessionNumber = (id: string) =>
    sessionNumberByLessonId instanceof Map
      ? (sessionNumberByLessonId.get(id) ?? 0)
      : (sessionNumberByLessonId[id] ?? 0)

  return [...lessons].sort((a, b) => {
    const dateCmp = b.lesson_date.localeCompare(a.lesson_date)
    if (dateCmp !== 0) return dateCmp

    const sessionCmp = sessionNumber(b.id) - sessionNumber(a.id)
    if (sessionCmp !== 0) return sessionCmp

    const startCmp = (a.start_time ?? '').localeCompare(b.start_time ?? '')
    if (startCmp !== 0) return startCmp

    return a.created_at.localeCompare(b.created_at)
  })
}

export function formatTimeValue(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 5)
}

export function formatSignedAtTime(signedAt: string | null | undefined) {
  if (!signedAt) return null
  try {
    return format(parseISO(signedAt), 'HH:mm')
  } catch {
    return null
  }
}

export function resolveLessonEndTimeLabel(options: {
  end_time?: string | null
  signature_signed_at?: string | null
  lesson_session_checked_in_at?: string | null
}) {
  const signedTime = formatSignedAtTime(options.signature_signed_at)
  if (signedTime) return signedTime

  const endTime = formatTimeValue(options.end_time)
  if (endTime) return endTime

  const checkedInTime = formatSignedAtTime(options.lesson_session_checked_in_at)
  if (checkedInTime) return checkedInTime

  return null
}

export function formatShortLessonDate(lessonDate: string) {
  const [year, month, day] = lessonDate.split('T')[0].split('-')
  if (!year || !month || !day) return lessonDate
  return `${year.slice(-2)}-${month}-${day}`
}

export function getLessonScheduleParts(options: {
  lessonDate: string
  start_time?: string | null
  end_time?: string | null
  signature_signed_at?: string | null
  lesson_session_checked_in_at?: string | null
}) {
  return {
    date: formatShortLessonDate(options.lessonDate),
    start: formatTimeValue(options.start_time),
    end: resolveLessonEndTimeLabel({
      end_time: options.end_time,
      signature_signed_at: options.signature_signed_at,
      lesson_session_checked_in_at: options.lesson_session_checked_in_at,
    }),
  }
}

export function formatLessonScheduleLabel(
  options: Parameters<typeof getLessonScheduleParts>[0],
) {
  const { date, start, end } = getLessonScheduleParts(options)

  if (start && end) return `${date} ${start} > ${end}`
  if (start) return `${date} ${start}`
  if (end) return `${date} > ${end}`
  return date
}

export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
  cancelled: '취소',
}

export type LessonScheduleTiming = {
  lesson_date: string
  start_time?: string | null
}

function parseLessonStartMinutes(startTime: string | null | undefined): number | null {
  if (!startTime) return null
  const [hours, minutes] = startTime.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

export function formatLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getTodayDateKey(asOf: Date = new Date()) {
  return formatLocalDateKey(asOf)
}

/** 수업 시작 시각이 기준 시각 이전(또는 같음)인지 */
export function isLessonOccurredBy(
  lesson: LessonScheduleTiming,
  asOf: Date = new Date(),
): boolean {
  const todayKey = getTodayDateKey(asOf)
  if (lesson.lesson_date < todayKey) return true
  if (lesson.lesson_date > todayKey) return false

  const startMinutes = parseLessonStartMinutes(lesson.start_time)
  if (startMinutes === null) return true

  const nowMinutes = asOf.getHours() * 60 + asOf.getMinutes()
  return startMinutes <= nowMinutes
}

export function filterLessonsUpToNow<T extends LessonScheduleTiming>(
  lessons: T[],
  asOf: Date = new Date(),
): T[] {
  return lessons.filter((lesson) => isLessonOccurredBy(lesson, asOf))
}

/** 회원 최근 수업 기록 — 종료·차감된 수업은 항상 표시 */
export function filterLessonsForRecentRecords<T extends LessonAttendanceRow>(
  lessons: T[],
  asOf: Date = new Date(),
): T[] {
  return lessons.filter((lesson) => {
    if (lesson.session_deducted) return true
    if (!isLessonOccurredBy(lesson, asOf)) return false
    if (lesson.attendance_status === 'present' && !isAttendanceMarked(lesson)) {
      return false
    }
    return true
  })
}

export type LessonAttendanceRow = LessonScheduleTiming & {
  attendance_status: string
  session_deducted?: boolean
  end_time?: string | null
  signature_id?: string | null
  lesson_sessions?: Array<{ checked_in_at?: string | null }> | null
}

/** 종료·서명(또는 세션 차감)이 기록된 완료 수업 */
export function isLessonCompletedRecord(
  lesson: Pick<LessonAttendanceRow, 'session_deducted' | 'end_time' | 'signature_id'>,
): boolean {
  if (!lesson.end_time) return false
  return Boolean(lesson.session_deducted || lesson.signature_id)
}

/** 출석 버튼을 눌렀거나 종료·차감이 기록된 경우만 true (예정 end_time 제외) */
export function isAttendanceMarked(lesson: LessonAttendanceRow): boolean {
  if (isLessonCompletedRecord(lesson)) return true
  if (lesson.attendance_status !== 'present') return true
  if (lesson.lesson_sessions?.[0]?.checked_in_at) return true
  return false
}

/** 수업현황 출석 집계와 동일 — 취소·미체크·미래 수업 제외 */
export function isLessonCountedAsMemberAttendance(
  lesson: LessonAttendanceRow,
  options?: {
    schedulePassed?: (row: LessonScheduleTiming) => boolean
  },
): boolean {
  const schedulePassed =
    options?.schedulePassed ?? ((row) => isLessonOccurredBy(row))

  if (lesson.attendance_status === 'cancelled') return false
  if (lesson.attendance_status === 'absent') return false
  if (!schedulePassed(lesson)) return false
  if (isLessonCompletedRecord(lesson)) return true
  if (lesson.attendance_status === 'makeup') return true
  if (lesson.attendance_status === 'present') return isAttendanceMarked(lesson)
  return false
}

export function getAttendanceDisplay(
  lesson: LessonAttendanceRow,
): { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' } | null {
  if (!isLessonOccurredBy(lesson)) return null
  if (!isAttendanceMarked(lesson)) {
    return { label: '-', variant: 'outline' }
  }

  const status = lesson.attendance_status
  if (status === 'present') {
    const checkedInAt = formatSignedAtTime(lesson.lesson_sessions?.[0]?.checked_in_at)
    return {
      label: checkedInAt ? `출석 ${checkedInAt}` : '출석',
      variant: 'default',
    }
  }
  if (status === 'absent') return { label: '결석', variant: 'destructive' }
  if (status === 'makeup') return { label: '보강', variant: 'secondary' }
  return { label: '취소', variant: 'secondary' }
}
