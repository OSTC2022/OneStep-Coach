/** Supabase select strings — avoid select('*') on list/hot paths */

export const PROFILE_SELECT =
  'id, email, full_name, role, approval_status, created_at, avatar_url, phone, kakao_id, instagram_id'

export const USER_LEGACY_SELECT = 'id, email, full_name, role, created_at'

export const MEMBER_LIST_SELECT_CORE =
  'id, name, phone, sport, age, birth_date, grade, is_active, primary_instructor_id, registered_at, body_baseline_recorded_at, created_at, height_cm, weight_kg, goal, injury_history, memo, parent_phone'

/** school 컬럼 마이그레이션 전 DB 호환 */
export const MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL = MEMBER_LIST_SELECT_CORE

export const MEMBER_LIST_SELECT_LEGACY =
  `${MEMBER_LIST_SELECT_CORE}, school, kakao_id, instagram_id`

export const MEMBER_LIST_SELECT =
  `${MEMBER_LIST_SELECT_LEGACY}, deleted_at`

export const MEMBER_LIST_SELECT_NO_SCHOOL =
  `${MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL}, deleted_at`

export const MEMBER_PICKER_SELECT = 'id, name, sport, age, birth_date, phone'

export const MEMBER_DETAIL_SELECT = MEMBER_LIST_SELECT

export const INSTRUCTOR_LIST_SELECT =
  'id, name, phone, kakao_id, instagram_id, blog_url, is_active, calendar_color, user_id, speciality, hourly_rate_weekday, hourly_rate_weekend, extra_member_rate, created_at'

export const INSTRUCTOR_PICKER_SELECT = 'id, name, calendar_color, is_active'

export const INSTRUCTOR_CALENDAR_SELECT =
  'id, name, calendar_color, is_active, hourly_rate_weekday, hourly_rate_weekend, extra_member_rate'

const LESSON_CORE_SELECT = `
  id,
  member_id,
  instructor_id,
  session_package_id,
  lesson_date,
  start_time,
  end_time,
  lesson_type,
  title,
  content,
  special_note,
  attendance_status,
  session_deducted,
  lesson_no,
  signature_id,
  created_at
`

const LESSON_RECURRENCE_SELECT = `
  recurrence_group_id,
  recurrence_pattern,
  event_type,
  recurrence,
  recurring_master_id,
  google_event_id,
  google_recurring_event_id,
  original_start_time,
  event_status
`

export const ATTENDANCE_LESSON_SELECT = `
  id,
  member_id,
  instructor_id,
  lesson_date,
  start_time,
  end_time,
  lesson_type,
  title,
  content,
  attendance_status,
  session_deducted,
  signature_id,
  lesson_sessions(checked_in_at),
  member:members(id, name, phone, sport),
  instructor:instructors(id, name, calendar_color)
`

export const LESSON_CALENDAR_SELECT_LEGACY = `
  ${LESSON_CORE_SELECT},
  member:members(id, name, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color)
`

export const LESSON_CALENDAR_SELECT = `
  ${LESSON_CORE_SELECT},
  ${LESSON_RECURRENCE_SELECT},
  member:members(id, name, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color)
`

export const LESSON_LIST_SELECT_LEGACY = `
  ${LESSON_CORE_SELECT},
  member:members(id, name, phone, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color),
  session_package:session_packages(id, total_sessions, remaining_sessions, is_active)
`

export const LESSON_LIST_SELECT = `
  ${LESSON_CORE_SELECT},
  ${LESSON_RECURRENCE_SELECT},
  member:members(id, name, phone, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color),
  session_package:session_packages(id, total_sessions, remaining_sessions, is_active)
`

export const LESSON_MUTATION_SELECT_LEGACY = `
  ${LESSON_CORE_SELECT},
  member:members(id, name, phone, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color)
`

export const LESSON_MUTATION_SELECT = `
  ${LESSON_CORE_SELECT},
  ${LESSON_RECURRENCE_SELECT},
  member:members(id, name, phone, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color)
`

export const SESSION_PACKAGE_LIST_SELECT = `
  id,
  member_id,
  total_sessions,
  remaining_sessions,
  price,
  paid_at,
  expires_at,
  payment_method,
  is_active,
  created_at,
  deleted_at,
  note,
  member:members(id, name, phone, deleted_at)
`

export const SESSION_PACKAGE_LIST_SELECT_LEGACY = `
  id,
  member_id,
  total_sessions,
  remaining_sessions,
  price,
  paid_at,
  expires_at,
  payment_method,
  is_active,
  created_at,
  note,
  member:members(id, name, phone)
`

export const SESSION_PACKAGE_DETAIL_SELECT =
  'id, member_id, total_sessions, remaining_sessions, price, paid_at, expires_at, payment_method, is_active, created_at, deleted_at, note'

export const SESSION_TRANSACTION_SELECT =
  'id, member_id, session_package_id, lesson_id, instructor_id, delta, reason, created_at'
