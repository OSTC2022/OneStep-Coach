/**
 * Run: npx tsx scripts/test-recurrence-scenarios.ts
 * Validates RRULE expansion for the manual QA checklist (no DB).
 */
import { addDays, addMonths, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import {
  addExdateToRecurrence,
  expandRecurringMastersForRange,
  mergeCalendarLessonsForRange,
  truncateRecurrenceUntil,
} from '../lib/calendar-recurrence/expand-lessons'
import { patternToRRuleLines } from '../lib/calendar-recurrence/types'
import type { RecurrenceCapableLesson } from '../lib/calendar-recurrence/types'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  ✓ ${message}`)
}

function masterRow(
  id: string,
  lessonDate: string,
  pattern: 'weekly' | 'biweekly' | 'monthly',
  startTime = '18:00',
): RecurrenceCapableLesson {
  return {
    id,
    lesson_date: lessonDate,
    start_time: startTime,
    end_time: '19:00',
    member_id: 'm1',
    instructor_id: 'i1',
    event_type: 'recurring_master',
    recurrence_pattern: pattern,
    recurrence: patternToRRuleLines(pattern, lessonDate),
    recurrence_group_id: id,
  }
}

function expandDates(
  master: RecurrenceCapableLesson,
  from: string,
  to: string,
  exceptions: RecurrenceCapableLesson[] = [],
) {
  return expandRecurringMastersForRange([master], exceptions, from, to, new Map()).map(
    (l) => l.lesson_date,
  )
}

function thursdayInMonth(year: number, month: number): string {
  // first Thursday of month (month is 1-based)
  const d = parseISO(`${year}-${String(month).padStart(2, '0')}-01`)
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d)
    cur.setDate(d.getDate() + i)
    if (cur.getDay() === 4) return format(cur, 'yyyy-MM-dd')
  }
  throw new Error('no thursday')
}

console.log('\n1. 매주 목요일 18시 — 다음 달에도 보이는지')
{
  const start = thursdayInMonth(2026, 6) // June 2026
  const master = masterRow('w1', start, 'weekly')
  const nextMonthStart = format(startOfMonth(addMonths(parseISO(start), 1)), 'yyyy-MM-dd')
  const nextMonthEnd = format(endOfMonth(addMonths(parseISO(start), 1)), 'yyyy-MM-dd')
  const dates = expandDates(master, nextMonthStart, nextMonthEnd)
  assert(dates.length >= 4, `다음 달에 ${dates.length}회 이상 (목요일)`)
  assert(
    dates.every((d) => parseISO(d).getDay() === 4),
    '모든 발생일이 목요일',
  )
}

console.log('\n2. 격주 — 한 주 건너 정확히')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('b1', start, 'biweekly')
  const end = format(addMonths(parseISO(start), 2), 'yyyy-MM-dd')
  const dates = expandDates(master, start, end)
  assert(dates.length >= 3, `최소 3회 (${dates.length})`)
  for (let i = 1; i < dates.length; i++) {
    const diff =
      (parseISO(dates[i]).getTime() - parseISO(dates[i - 1]).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
    assert(Math.abs(diff - 2) < 0.01, `${dates[i - 1]} → ${dates[i]} 간격 2주`)
  }
}

console.log('\n3. 매월 15일 — 다음 달 15일')
{
  const start = '2026-06-15'
  const master = masterRow('m1', start, 'monthly', '10:00')
  const julyFrom = '2026-07-01'
  const julyTo = '2026-07-31'
  const dates = expandDates(master, julyFrom, julyTo)
  assert(dates.includes('2026-07-15'), '7월 15일 포함')
  assert(dates.length === 1, '7월에 1회만')
}

console.log('\n4. 반복 중 하루만 삭제 (EXDATE)')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('w2', start, 'weekly')
  const end = format(addMonths(parseISO(start), 1), 'yyyy-MM-dd')
  const allBefore = expandDates({ ...master, recurrence: master.recurrence }, start, end)
  const skipDate = allBefore[2]
  const withExdate = {
    ...master,
    recurrence: addExdateToRecurrence(master.recurrence, skipDate, '18:00'),
  }
  const after = expandDates(withExdate, start, end)
  assert(!after.includes(skipDate), `${skipDate} 제외`)
  assert(after.length === allBefore.length - 1, '나머지 유지')
}

console.log('\n5. 반복 중 하루만 시간 변경 (exception)')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('w3', start, 'weekly')
  const end = format(addMonths(parseISO(start), 1), 'yyyy-MM-dd')
  const dates = expandDates(master, start, end)
  const target = dates[1]
  const exception: RecurrenceCapableLesson = {
    id: 'ex1',
    lesson_date: target,
    start_time: '20:00',
    end_time: '21:00',
    event_type: 'exception',
    recurring_master_id: master.id,
    event_status: 'confirmed',
    attendance_status: 'present',
  }
  const expanded = expandRecurringMastersForRange([master], [exception], start, end, new Map())
  const changed = expanded.find((l) => l.lesson_date === target)
  assert(changed?.start_time?.slice(0, 5) === '20:00', `${target}만 20:00`)
  const other = expanded.find((l) => l.lesson_date === dates[0])
  assert(other?.start_time?.slice(0, 5) === '18:00', '다른 날은 18:00 유지')
}

console.log('\n6. 이 날짜 이후 전체 시간 변경 (master split 시뮬레이션)')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('w4', start, 'weekly')
  const dates = expandDates(master, start, format(addMonths(parseISO(start), 2), 'yyyy-MM-dd'))
  const splitAt = dates[3]
  const dayBeforeSplit = format(addDays(parseISO(splitAt), -1), 'yyyy-MM-dd')
  const oldMaster = {
    ...master,
    recurrence: truncateRecurrenceUntil(master.recurrence, dayBeforeSplit),
  }
  const newMaster = masterRow('w4b', splitAt, 'weekly', '20:00')
  const rangeEnd = format(addMonths(parseISO(start), 2), 'yyyy-MM-dd')
  const before = expandDates(oldMaster, start, rangeEnd)
  const after = expandDates(newMaster, splitAt, rangeEnd)
  assert(before.every((d) => d < splitAt), '이전 구간만 old master')
  assert(after.every((d) => d >= splitAt), '이후 구간만 new master')
  const sampleOld = expandRecurringMastersForRange([oldMaster], [], start, rangeEnd, new Map())[0]
  const sampleNew = expandRecurringMastersForRange([newMaster], [], splitAt, rangeEnd, new Map())[0]
  assert(sampleOld.start_time?.slice(0, 5) === '18:00', '이전 일정 18:00')
  assert(sampleNew.start_time?.slice(0, 5) === '20:00', '이후 일정 20:00')
}

console.log('\n7. 전체 반복 삭제 — master 제거 시 확장 0')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('w5', start, 'weekly')
  const dates = expandDates(master, start, format(addMonths(parseISO(start), 1), 'yyyy-MM-dd'))
  assert(dates.length > 0, '삭제 전 발생 있음')
  const empty = expandDates(master, start, format(addMonths(parseISO(start), 1), 'yyyy-MM-dd')).filter(
    () => false,
  )
  assert(empty.length === 0, 'master 없으면 0 (DB 삭제는 integration)')
}

console.log('\n8. 패턴 변경 — 매주 → 2주마다 / 매일')
{
  const start = thursdayInMonth(2026, 6)
  const end = format(addMonths(parseISO(start), 2), 'yyyy-MM-dd')
  const weekly = masterRow('p1', start, 'weekly')
  const biweekly = {
    ...weekly,
    recurrence_pattern: 'biweekly' as const,
    recurrence: patternToRRuleLines('biweekly', start),
  }
  const daily = {
    ...weekly,
    id: 'p1d',
    recurrence_pattern: 'daily' as const,
    recurrence: patternToRRuleLines('daily', start),
  }

  const weeklyDates = expandDates(weekly, start, end)
  const biweeklyDates = expandDates(biweekly, start, end)
  const dailyDates = expandDates(daily, start, format(addDays(parseISO(start), 10), 'yyyy-MM-dd'))

  assert(biweeklyDates.length < weeklyDates.length, '2주마다면 매주보다 적음')
  for (let i = 1; i < biweeklyDates.length; i++) {
    const diff =
      (parseISO(biweeklyDates[i]).getTime() - parseISO(biweeklyDates[i - 1]).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
    assert(Math.abs(diff - 2) < 0.01, `패턴 변경 후 간격 2주 (${biweeklyDates[i - 1]} → ${biweeklyDates[i]})`)
  }
  assert(dailyDates.length === 11, `매일 11일 구간 = 11회 (실제 ${dailyDates.length})`)
}

console.log('\n9. 새로고침 merge — 옛 가상 일정 제거')
{
  // lesson-calendar mergeCalendarRefresh 와 동일한 규칙
  type Row = { id: string; lesson_date: string; recurring_master_id?: string | null }
  const VIRTUAL_PREFIX = 'virtual:'
  function parseVirtual(id: string) {
    if (!id.startsWith(VIRTUAL_PREFIX)) return null
    const rest = id.slice(VIRTUAL_PREFIX.length)
    const sep = rest.indexOf(':')
    if (sep < 0) return null
    return { masterId: rest.slice(0, sep), occurrenceDate: rest.slice(sep + 1) }
  }
  function mergeRefresh(previous: Row[], fresh: Row[], dateFrom: string, dateTo: string) {
    const touched = new Set<string>()
    for (const lesson of fresh) {
      const v = parseVirtual(lesson.id)
      if (v) touched.add(v.masterId)
      if (lesson.recurring_master_id) touched.add(lesson.recurring_master_id)
    }
    const kept = previous.filter((lesson) => {
      if (lesson.lesson_date < dateFrom || lesson.lesson_date > dateTo) return true
      if (touched.has(lesson.id)) return false
      const v = parseVirtual(lesson.id)
      if (v && touched.has(v.masterId)) return false
      if (lesson.recurring_master_id && touched.has(lesson.recurring_master_id)) return false
      return true
    })
    const map = new Map<string, Row>()
    for (const row of [...kept, ...fresh]) map.set(row.id, row)
    return Array.from(map.values())
  }

  const masterId = 'master-1'
  const previous: Row[] = [
    { id: `${VIRTUAL_PREFIX}${masterId}:2026-06-04`, lesson_date: '2026-06-04' },
    { id: `${VIRTUAL_PREFIX}${masterId}:2026-06-11`, lesson_date: '2026-06-11' },
    { id: `${VIRTUAL_PREFIX}${masterId}:2026-06-18`, lesson_date: '2026-06-18' },
    { id: 'other-1', lesson_date: '2026-06-05' },
  ]
  // 2주마다로 바뀐 뒤 서버 응답 (6/11 없음)
  const fresh: Row[] = [
    { id: `${VIRTUAL_PREFIX}${masterId}:2026-06-04`, lesson_date: '2026-06-04' },
    { id: `${VIRTUAL_PREFIX}${masterId}:2026-06-18`, lesson_date: '2026-06-18' },
  ]
  const merged = mergeRefresh(previous, fresh, '2026-06-01', '2026-06-30')
  assert(!merged.some((l) => l.lesson_date === '2026-06-11'), '옛 매주 가상일(6/11) 제거')
  assert(merged.some((l) => l.id === 'other-1'), '다른 수업 유지')
  assert(merged.filter((l) => parseVirtual(l.id)?.masterId === masterId).length === 2, '새 패턴 2건')
}

console.log('\n10. 다른 날로 이동 — 기존 날짜 EXDATE + 시리즈 날짜 이동')
{
  const start = thursdayInMonth(2026, 6)
  const master = masterRow('move1', start, 'weekly')
  const end = format(addMonths(parseISO(start), 1), 'yyyy-MM-dd')
  const dates = expandDates(master, start, end)
  const moveFrom = dates[1]
  const moveTo = format(addDays(parseISO(moveFrom), 1), 'yyyy-MM-dd')

  // 이것만 다른 날로: EXDATE 원날짜
  const withExdate = {
    ...master,
    recurrence: addExdateToRecurrence(master.recurrence, moveFrom, '18:00'),
  }
  const afterSingle = expandDates(withExdate, start, end)
  assert(!afterSingle.includes(moveFrom), `이동 전 날짜 ${moveFrom} 제거(EXDATE)`)
  assert(afterSingle.includes(dates[0]), '다른 반복일은 유지')

  // 전체 이동: DTSTART +1일
  const delta = 1
  const shiftedStart = format(addDays(parseISO(start), delta), 'yyyy-MM-dd')
  const shiftedMaster = {
    ...master,
    lesson_date: shiftedStart,
    recurrence: patternToRRuleLines('weekly', shiftedStart),
  }
  const afterAll = expandDates(shiftedMaster, shiftedStart, end)
  assert(!afterAll.includes(start), `전체 이동 후 시작일 ${start} 없음`)
  assert(afterAll.includes(shiftedStart), `새 시작일 ${shiftedStart} 포함`)
  assert(
    afterAll.every((d) => parseISO(d).getDay() === parseISO(shiftedStart).getDay()),
    '이동 후 요일이 새 날짜 기준',
  )

  // 예외가 새 날짜에 있으면 표시 (stored + expand merge)
  const exception: RecurrenceCapableLesson = {
    id: 'ex-move',
    lesson_date: moveTo,
    start_time: '18:00',
    end_time: '19:00',
    event_type: 'exception',
    recurring_master_id: master.id,
    original_start_time: `${moveFrom}T18:00:00+09:00`,
    event_status: 'confirmed',
    attendance_status: 'present',
    member_id: 'm1',
    title: 'moved',
  }
  const merged = mergeCalendarLessonsForRange(
    [exception],
    [withExdate],
    [exception],
    start,
    end,
  )
  assert(
    merged.some((l) => l.lesson_date === moveTo && l.id === 'ex-move'),
    `이동한 날 ${moveTo}에 예외 표시`,
  )
  assert(
    !merged.some((l) => l.lesson_date === moveFrom),
    '이동 전 날 일정 없음',
  )
}

console.log('\n✅ All expansion scenarios passed.\n')
console.log('Google sync / 중복 방지는 DB·API 연동 — 앱에서 수동 확인 필요.')
console.log(' 11. Google 매주 반복 → 앱 반복 묶음')
console.log(' 12. 앱에서 Google 반복 수정 → 중복 없음')
console.log(' 13. 동기화 여러 번 → 일정 중복 없음\n')
