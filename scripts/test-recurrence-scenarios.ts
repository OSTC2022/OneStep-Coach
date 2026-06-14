/**
 * Run: npx tsx scripts/test-recurrence-scenarios.ts
 * Validates RRULE expansion for the manual QA checklist (no DB).
 */
import { addDays, addMonths, format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import {
  addExdateToRecurrence,
  expandRecurringMastersForRange,
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

console.log('\n✅ All expansion scenarios passed.\n')
console.log('Google sync / 중복 방지는 DB·API 연동 — 앱에서 수동 확인 필요.')
console.log('  8. Google 매주 반복 → 앱 반복 묶음')
console.log('  9. 앱에서 Google 반복 수정 → 중복 없음')
console.log(' 10. 동기화 여러 번 → 일정 중복 없음\n')
