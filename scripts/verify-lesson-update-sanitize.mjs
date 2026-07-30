/**
 * 수업 수정 payload 화이트리스트 검증
 * — preserve_title_identity 등 비DB 키가 update에 섞이면 PGRST204로 실패함
 */

const LESSON_UPDATE_ALLOWED_KEYS = new Set([
  'member_id',
  'title',
  'instructor_id',
  'session_package_id',
  'lesson_date',
  'start_time',
  'end_time',
  'lesson_type',
  'content',
  'special_note',
  'attendance_status',
  'recurrence_group_id',
  'recurrence_pattern',
  'event_type',
  'recurrence',
  'recurring_master_id',
  'original_start_time',
  'google_sync_status',
])

function sanitizeLessonUpdatePayload(updates) {
  const payload = {}
  for (const key of LESSON_UPDATE_ALLOWED_KEYS) {
    if (key in updates && updates[key] !== undefined) {
      payload[key] = updates[key]
    }
  }
  return payload
}

function mergeLessonsById(...lists) {
  const map = new Map()
  for (const list of lists) {
    for (const lesson of list) {
      map.set(lesson.id, lesson)
    }
  }
  return Array.from(map.values())
}

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else {
    console.log('OK:', msg)
  }
}

const dirty = {
  member_id: 'm1',
  title: '연경모(축구)',
  instructor_id: 'i1',
  lesson_date: '2026-08-02',
  start_time: '18:00',
  end_time: '19:00',
  lesson_type: 'personal',
  session_package_id: 'pkg1',
  preserve_title_identity: true,
  someClientOnlyFlag: true,
}
const clean = sanitizeLessonUpdatePayload(dirty)
assert(!('preserve_title_identity' in clean), 'strips preserve_title_identity')
assert(!('someClientOnlyFlag' in clean), 'strips unknown client keys')
assert(clean.member_id === 'm1', 'keeps member_id')
assert(clean.lesson_date === '2026-08-02', 'keeps lesson_date')
assert(clean.session_package_id === 'pkg1', 'keeps session_package_id')

const prev = [
  { id: 'a', lesson_date: '2026-08-02', title: 'kept' },
  { id: 'b', lesson_date: '2026-08-02', title: 'old-b' },
  { id: 'c', lesson_date: '2026-08-03', title: 'later' },
]
const fetched = [
  { id: 'b', lesson_date: '2026-08-02', title: 'new-b' },
  { id: 'd', lesson_date: '2026-08-02', title: 'new-d' },
]
const merged = mergeLessonsById(prev, fetched)
assert(merged.length === 4, 'merge keeps truncated prev + server rows')
assert(merged.find((l) => l.id === 'a')?.title === 'kept', 'keeps missing-from-fetch row')
assert(merged.find((l) => l.id === 'b')?.title === 'new-b', 'server wins on conflict')
assert(merged.find((l) => l.id === 'd')?.title === 'new-d', 'adds new server row')

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll lesson-update sanitize checks passed')
