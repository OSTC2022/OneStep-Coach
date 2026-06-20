import { getLessonCalendarLabel } from '@/lib/calendar-utils'
import { isGroupLessonAttendanceMarked } from '@/lib/group-lesson-attendance'
import { dedupeLessonsBySlot } from '@/lib/lesson-slot-dedupe'
import { isKoreanHoliday } from '@/lib/korean-holidays'
import {
  filterLessonsUpToNow,
  isLessonCountedAsMemberAttendance,
  isLessonOccurredBy,
  type LessonAttendanceRow,
} from '@/lib/lesson-record-utils'
import { isAthleticsClubLessonType, isRunningLessonType } from '@/lib/lesson-types'
import {
  getAthleticsClubLessonPayAmount,
} from '@/lib/athletics-club-lesson-pay'
import { getTrialLessonPayAmount, isTrialLessonType } from '@/lib/trial-lesson-pay'
import { getRunningLessonPayAmount } from '@/lib/running-lesson-pay'

export { filterLessonsUpToNow, isLessonOccurredBy }

export type InstructorRateConfig = {
  hourly_rate_weekday: number
  hourly_rate_weekend: number
  extra_member_rate: number
}

export type LessonPayRecord = LessonAttendanceRow & {
  instructor_id?: string | null
  lesson_type?: string | null
  member_id?: string | null
  title?: string | null
  content?: string | null
  special_note?: string | null
  event_status?: string | null
  event_type?: string | null
}

export type InstructorPaySlot = {
  lessonDate: string
  startTime: string
  memberCount: number
  isWeekendOrHoliday: boolean
  pay: number
}

export type InstructorPaySlotMember = {
  lessonId: string
  name: string
  pay: number
  calculatedPay?: number
  isOverridden?: boolean
}

export type InstructorPaySlotDetail = InstructorPaySlot & {
  slotKey: string
  members: InstructorPaySlotMember[]
  calculatedPay?: number
  calculatedMemberCount?: number
  isOverridden?: boolean
}

export type InstructorPaySlotOverrideRecord = {
  slotKey: string
  payAmount: number
  memberCount?: number | null
}

export type InstructorPayDayGroup = {
  lessonDate: string
  totalPay: number
  slots: InstructorPaySlotDetail[]
}

export type InstructorPaySummary = {
  weekdaySlots: number
  weekendSlots: number
  weekdayPay: number
  weekendPay: number
  totalPay: number
  totalLessons: number
  slots: InstructorPaySlot[]
}

function parseLessonDate(lessonDate: string): Date {
  return new Date(`${lessonDate}T12:00:00`)
}

export function normalizeInstructorRates(
  rates: InstructorRateConfig,
): InstructorRateConfig {
  return {
    hourly_rate_weekday: Number(rates.hourly_rate_weekday) || 30000,
    hourly_rate_weekend: Number(rates.hourly_rate_weekend) || 40000,
    extra_member_rate: Number(rates.extra_member_rate) || 10000,
  }
}

/** 토·일·공휴일 → 주말 요금 */
export function isWeekendOrHolidayRateDay(lessonDate: string): boolean {
  const date = parseLessonDate(lessonDate)
  const day = date.getDay()
  return day === 0 || day === 6 || isKoreanHoliday(date)
}

/**
 * 시간대(타임) 1회 강사료
 * - 평일: 3만(기본) + (인원-1) × 1만
 * - 주말·공휴일: 4만(기본) + (인원-1) × 1만
 */
export function calcSlotInstructorPay(
  memberCount: number,
  isWeekendOrHoliday: boolean,
  rates: InstructorRateConfig,
): number {
  const normalized = normalizeInstructorRates(rates)
  const count = Math.max(1, Math.floor(memberCount))
  const base = isWeekendOrHoliday
    ? normalized.hourly_rate_weekend
    : normalized.hourly_rate_weekday
  const extraMembers = Math.max(0, count - 1)

  return base + extraMembers * normalized.extra_member_rate
}

export function formatInstructorPayShort(amount: number): string {
  if (amount >= 10000 && amount % 10000 === 0) {
    return `${amount / 10000}만원`
  }
  return `${amount.toLocaleString()}원`
}

export function getInstructorSlotPayKey(
  lessonDate: string,
  startTime: string | null | undefined,
  instructorId: string,
): string {
  return `${lessonDate}|${startTime?.slice(0, 5) ?? ''}|${instructorId}`
}

export function getInstructorMemberPayOverrideKey(
  slotKey: string,
  lessonId: string,
): string {
  return `${slotKey}|${lessonId}`
}

/** 타임 내 회원별 기본 분배: 기본요금 + 추가 인원 × 추가요금 */
export function splitSlotPayAmongMembers(
  memberCount: number,
  isWeekendOrHoliday: boolean,
  rates: InstructorRateConfig,
): number[] {
  const normalized = normalizeInstructorRates(rates)
  const count = Math.max(1, Math.floor(memberCount))
  const base = isWeekendOrHoliday
    ? normalized.hourly_rate_weekend
    : normalized.hourly_rate_weekday
  const extra = normalized.extra_member_rate

  const pays = [base]
  for (let i = 1; i < count; i++) pays.push(extra)
  return pays
}

export function buildInstructorSlotPayMap<
  T extends LessonPayRecord & { instructor_id?: string | null },
>(
  lessons: T[],
  instructors: Array<InstructorRateConfig & { id: string }>,
): Map<string, { memberCount: number; pay: number }> {
  const instructorMap = new Map(instructors.map((instructor) => [instructor.id, instructor]))
  const groups = new Map<string, T[]>()

  for (const lesson of dedupeLessonsBySlot(lessons)) {
    if (!lesson.instructor_id || !isSlotCountableLesson(lesson)) continue
    const key = getInstructorSlotPayKey(
      lesson.lesson_date,
      lesson.start_time,
      lesson.instructor_id,
    )
    const group = groups.get(key) ?? []
    group.push(lesson)
    groups.set(key, group)
  }

  const result = new Map<string, { memberCount: number; pay: number }>()
  for (const [key, group] of groups) {
    const instructor = instructorMap.get(group[0].instructor_id!)
    if (!instructor) continue
    const payInfo = calcSlotPayForLessons(group, instructor)
    if (payInfo) {
      result.set(key, {
        memberCount: payInfo.memberCount,
        pay: payInfo.pay,
      })
    }
  }

  return result
}

function buildSlotMemberPays<T extends LessonPayRecord>(
  slotLessons: T[],
  rates: InstructorRateConfig,
): {
  entries: Array<{ lesson: T; pay: number }>
  totalPay: number
  memberCount: number
  isWeekendOrHoliday: boolean
} | null {
  const countable = slotLessons.filter(isSlotCountableLesson)
  if (countable.length === 0) return null

  const lessonDate = countable[0].lesson_date
  const isWeekendOrHoliday = isWeekendOrHolidayRateDay(lessonDate)
  const regularCount = countable.filter(
    (lesson) =>
      !isTrialLessonType(lesson.lesson_type) &&
      !isRunningLessonType(lesson.lesson_type) &&
      !isAthleticsClubLessonType(lesson.lesson_type),
  ).length
  const regularPays = splitSlotPayAmongMembers(
    regularCount,
    isWeekendOrHoliday,
    rates,
  )
  let regularIdx = 0
  const entries: Array<{ lesson: T; pay: number }> = []
  let totalPay = 0

  for (const lesson of countable) {
    const pay = isTrialLessonType(lesson.lesson_type)
      ? getTrialLessonPayAmount(lesson.lesson_date)
      : isRunningLessonType(lesson.lesson_type)
        ? getRunningLessonPayAmount()
        : isAthleticsClubLessonType(lesson.lesson_type)
          ? getAthleticsClubLessonPayAmount()
          : regularPays[regularIdx++] ?? 0
    entries.push({ lesson, pay })
    totalPay += pay
  }

  return {
    entries,
    totalPay,
    memberCount: countable.length,
    isWeekendOrHoliday,
  }
}

export function calcSlotPayForLessons(
  lessons: LessonPayRecord[],
  rates: InstructorRateConfig,
): { memberCount: number; pay: number; isWeekendOrHoliday: boolean } | null {
  const built = buildSlotMemberPays(lessons, rates)
  if (!built) return null

  return {
    memberCount: built.memberCount,
    pay: built.totalPay,
    isWeekendOrHoliday: built.isWeekendOrHoliday,
  }
}

/** 수업현황에서 출석(또는 체험·단체 출석)이 확인된 수업만 강사료 집계 */
export function isLessonCountedForInstructorPay(lesson: LessonPayRecord): boolean {
  if (lesson.event_status === 'cancelled') return false
  if (lesson.event_type === 'recurring_master') return false
  if (!isLessonOccurredBy(lesson)) return false

  if (!lesson.member_id) {
    if (lesson.attendance_status === 'cancelled') return false
    if (isAthleticsClubLessonType(lesson.lesson_type)) {
      return isGroupLessonAttendanceMarked(lesson)
    }
    if (isTrialLessonType(lesson.lesson_type)) {
      return true
    }
    return false
  }

  return isLessonCountedAsMemberAttendance(lesson)
}

/** 타임 인원·강사료 집계 대상 (요금 계산식은 기존 설정 그대로) */
export function isSlotCountableLesson(lesson: LessonPayRecord): boolean {
  return isLessonCountedForInstructorPay(lesson)
}

function isPayableLesson(lesson: LessonPayRecord): boolean {
  return isLessonCountedForInstructorPay(lesson)
}

function getPaySlotKey(lesson: LessonPayRecord): string {
  const time = lesson.start_time?.slice(0, 5) ?? ''
  return `${lesson.lesson_date}|${time}`
}

export function summarizeInstructorPay(
  lessons: LessonPayRecord[],
  rates: InstructorRateConfig,
): InstructorPaySummary {
  const payable = dedupeLessonsBySlot(lessons).filter(isPayableLesson)
  const slotMap = new Map<string, LessonPayRecord[]>()

  for (const lesson of payable) {
    const key = getPaySlotKey(lesson)
    const group = slotMap.get(key) ?? []
    group.push(lesson)
    slotMap.set(key, group)
  }

  let weekdaySlots = 0
  let weekendSlots = 0
  let weekdayPay = 0
  let weekendPay = 0
  const slots: InstructorPaySlot[] = []

  for (const [key, slotLessons] of slotMap) {
    const [lessonDate, startTime] = key.split('|')
    const built = buildSlotMemberPays(slotLessons, rates)
    if (!built) continue

    slots.push({
      lessonDate,
      startTime,
      memberCount: built.memberCount,
      isWeekendOrHoliday: built.isWeekendOrHoliday,
      pay: built.totalPay,
    })

    if (built.isWeekendOrHoliday) {
      weekendSlots++
      weekendPay += built.totalPay
    } else {
      weekdaySlots++
      weekdayPay += built.totalPay
    }
  }

  slots.sort((a, b) => {
    const dateCmp = a.lessonDate.localeCompare(b.lessonDate)
    if (dateCmp !== 0) return dateCmp
    return a.startTime.localeCompare(b.startTime)
  })

  return {
    weekdaySlots,
    weekendSlots,
    weekdayPay,
    weekendPay,
    totalPay: weekdayPay + weekendPay,
    totalLessons: payable.length,
    slots,
  }
}

export type LessonPayDetailRecord = LessonPayRecord & {
  id: string
  title?: string | null
  content?: string | null
  member?: { id: string; name: string } | null
}

export function getLessonPayDisplayName(lesson: LessonPayDetailRecord): string {
  const label = getLessonCalendarLabel(lesson)
  return label === '일정' ? '미등록' : label
}

export function summarizeInstructorPayDetailed(
  lessons: LessonPayDetailRecord[],
  rates: InstructorRateConfig,
) {
  const summary = summarizeInstructorPay(lessons, rates)
  const payable = dedupeLessonsBySlot(lessons).filter(isPayableLesson)
  const slotMap = new Map<string, LessonPayDetailRecord[]>()

  for (const lesson of payable) {
    const key = getPaySlotKey(lesson)
    const group = slotMap.get(key) ?? []
    group.push(lesson)
    slotMap.set(key, group)
  }

  const slotDetails: InstructorPaySlotDetail[] = []

  for (const [key, slotLessons] of slotMap) {
    const [lessonDate, startTime] = key.split('|')
    const built = buildSlotMemberPays(slotLessons, rates)
    if (!built) continue

    slotDetails.push({
      slotKey: key,
      lessonDate,
      startTime,
      memberCount: built.memberCount,
      isWeekendOrHoliday: built.isWeekendOrHoliday,
      pay: built.totalPay,
      members: built.entries.map(({ lesson, pay }) => ({
        lessonId: lesson.id,
        name: getLessonPayDisplayName(lesson),
        pay,
        calculatedPay: pay,
      })),
    })
  }

  slotDetails.sort((a, b) => {
    const dateCmp = a.lessonDate.localeCompare(b.lessonDate)
    if (dateCmp !== 0) return dateCmp
    return a.startTime.localeCompare(b.startTime)
  })

  return {
    ...summary,
    slotDetails,
    dayGroups: groupInstructorPayByDay(slotDetails),
  }
}

function isMemberPayOverrideKey(slotKey: string) {
  return slotKey.split('|').length >= 3
}

function applySlotLevelOverride(
  slot: InstructorPaySlotDetail,
  override: InstructorPaySlotOverrideRecord,
): InstructorPaySlotDetail {
  const calculatedPay = slot.calculatedPay ?? slot.pay
  const calculatedTotal = slot.members.reduce(
    (sum, member) => sum + (member.calculatedPay ?? member.pay),
    0,
  )
  const ratio =
    calculatedTotal > 0 ? override.payAmount / calculatedTotal : 1

  const members = slot.members.map((member) => {
    const basePay = member.calculatedPay ?? member.pay
    return {
      ...member,
      calculatedPay: member.calculatedPay ?? member.pay,
      pay: Math.round(basePay * ratio),
    }
  })

  const pay = members.reduce((sum, member) => sum + member.pay, 0)

  return {
    ...slot,
    calculatedPay,
    calculatedMemberCount: slot.calculatedMemberCount ?? slot.memberCount,
    pay,
    memberCount: override.memberCount ?? slot.memberCount,
    members,
    isOverridden: true,
  }
}

function applyMemberLevelOverrides(
  slot: InstructorPaySlotDetail,
  memberOverrides: Map<string, InstructorPaySlotOverrideRecord>,
): InstructorPaySlotDetail {
  let hasOverride = false
  const members = slot.members.map((member) => {
    const memberKey = getInstructorMemberPayOverrideKey(
      slot.slotKey,
      member.lessonId,
    )
    const override = memberOverrides.get(memberKey)
    if (!override) {
      return {
        ...member,
        calculatedPay: member.calculatedPay ?? member.pay,
      }
    }

    hasOverride = true
    return {
      ...member,
      calculatedPay: member.calculatedPay ?? member.pay,
      pay: override.payAmount,
      isOverridden: true,
    }
  })

  if (!hasOverride) return slot

  return {
    ...slot,
    calculatedPay: slot.calculatedPay ?? slot.pay,
    pay: members.reduce((sum, member) => sum + member.pay, 0),
    members,
    isOverridden: true,
  }
}

export function applyInstructorPaySlotOverrides<
  T extends {
    weekdaySlots: number
    weekendSlots: number
    weekdayPay: number
    weekendPay: number
    totalPay: number
    dayGroups: InstructorPayDayGroup[]
  },
>(detail: T, overrides: InstructorPaySlotOverrideRecord[]): T {
  if (overrides.length === 0) return detail

  const slotOverrides = new Map<string, InstructorPaySlotOverrideRecord>()
  const memberOverrides = new Map<string, InstructorPaySlotOverrideRecord>()

  for (const item of overrides) {
    if (isMemberPayOverrideKey(item.slotKey)) {
      memberOverrides.set(item.slotKey, item)
    } else {
      slotOverrides.set(item.slotKey, item)
    }
  }

  const dayGroups = detail.dayGroups.map((day) => {
    const slots = day.slots.map((slot) => {
      const slotMemberOverrides = new Map<string, InstructorPaySlotOverrideRecord>()
      for (const member of slot.members) {
        const memberKey = getInstructorMemberPayOverrideKey(
          slot.slotKey,
          member.lessonId,
        )
        const override = memberOverrides.get(memberKey)
        if (override) slotMemberOverrides.set(memberKey, override)
      }

      if (slotMemberOverrides.size > 0) {
        return applyMemberLevelOverrides(slot, slotMemberOverrides)
      }

      const slotOverride = slotOverrides.get(slot.slotKey)
      if (!slotOverride) return slot

      return applySlotLevelOverride(slot, slotOverride)
    })

    return {
      ...day,
      slots,
      totalPay: slots.reduce((sum, slot) => sum + slot.pay, 0),
    }
  })

  let weekdaySlots = 0
  let weekendSlots = 0
  let weekdayPay = 0
  let weekendPay = 0

  for (const day of dayGroups) {
    for (const slot of day.slots) {
      if (slot.isWeekendOrHoliday) {
        weekendSlots++
        weekendPay += slot.pay
      } else {
        weekdaySlots++
        weekdayPay += slot.pay
      }
    }
  }

  return {
    ...detail,
    dayGroups,
    weekdaySlots,
    weekendSlots,
    weekdayPay,
    weekendPay,
    totalPay: weekdayPay + weekendPay,
  }
}

export function groupInstructorPayByDay(
  slotDetails: InstructorPaySlotDetail[],
): InstructorPayDayGroup[] {
  const byDate = new Map<string, InstructorPaySlotDetail[]>()

  for (const slot of slotDetails) {
    const group = byDate.get(slot.lessonDate) ?? []
    group.push(slot)
    byDate.set(slot.lessonDate, group)
  }

  return [...byDate.entries()]
    .map(([lessonDate, slots]) => ({
      lessonDate,
      totalPay: slots.reduce((sum, slot) => sum + slot.pay, 0),
      slots,
    }))
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate))
}

export type InstructorPayrollRow = {
  id: string
  name: string
  totalLessons: number
  weekdaySlots: number
  weekendSlots: number
  weekdayPay: number
  weekendPay: number
  totalPay: number
}

export function buildInstructorPayroll<
  T extends InstructorRateConfig & { id: string; name: string },
>(instructors: T[], lessons: LessonPayRecord[]): InstructorPayrollRow[] {
  const lessonsByInstructor = new Map<string, LessonPayRecord[]>()

  for (const lesson of lessons) {
    if (!lesson.instructor_id || !isPayableLesson(lesson)) continue
    const group = lessonsByInstructor.get(lesson.instructor_id) ?? []
    group.push(lesson)
    lessonsByInstructor.set(lesson.instructor_id, group)
  }

  return instructors.map((instructor) => {
    const instructorLessons = lessonsByInstructor.get(instructor.id) ?? []
    const summary = summarizeInstructorPay(instructorLessons, instructor)

    return {
      id: instructor.id,
      name: instructor.name,
      totalLessons: summary.totalLessons,
      weekdaySlots: summary.weekdaySlots,
      weekendSlots: summary.weekendSlots,
      weekdayPay: summary.weekdayPay,
      weekendPay: summary.weekendPay,
      totalPay: summary.totalPay,
    }
  })
}

export function calcManualSlotPay(
  slots: Array<{ isWeekendOrHoliday: boolean; memberCount: number }>,
  rates: InstructorRateConfig,
): InstructorPaySummary {
  const normalized = slots.map((slot) => ({
    lesson_date: '2000-01-01',
    start_time: '09:00',
    attendance_status: 'present' as const,
    __isWeekend: slot.isWeekendOrHoliday,
    __memberCount: Math.max(1, slot.memberCount),
  }))

  let weekdaySlots = 0
  let weekendSlots = 0
  let weekdayPay = 0
  let weekendPay = 0
  const resultSlots: InstructorPaySlot[] = []

  for (const slot of normalized) {
    const pay = calcSlotInstructorPay(slot.__memberCount, slot.__isWeekend, rates)
    resultSlots.push({
      lessonDate: slot.lesson_date,
      startTime: slot.start_time ?? '',
      memberCount: slot.__memberCount,
      isWeekendOrHoliday: slot.__isWeekend,
      pay,
    })
    if (slot.__isWeekend) {
      weekendSlots++
      weekendPay += pay
    } else {
      weekdaySlots++
      weekdayPay += pay
    }
  }

  return {
    weekdaySlots,
    weekendSlots,
    weekdayPay,
    weekendPay,
    totalPay: weekdayPay + weekendPay,
    totalLessons: normalized.reduce((sum, slot) => sum + slot.__memberCount, 0),
    slots: resultSlots,
  }
}
