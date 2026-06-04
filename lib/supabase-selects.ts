/** Supabase select strings — avoid select('*') on list/hot paths */

export const PROFILE_SELECT =
  'id, email, full_name, role, approval_status, created_at'

export const USER_LEGACY_SELECT = 'id, email, full_name, role, created_at'

export const MEMBER_LIST_SELECT =
  'id, name, phone, sport, age, birth_date, grade, is_active, primary_instructor_id, registered_at, created_at, height_cm, weight_kg, goal, injury_history, memo, parent_phone'

export const MEMBER_PICKER_SELECT = 'id, name, sport, age, birth_date, phone'

export const MEMBER_DETAIL_SELECT = MEMBER_LIST_SELECT

export const INSTRUCTOR_LIST_SELECT =
  'id, name, phone, is_active, calendar_color, user_id, speciality, hourly_rate_weekday, hourly_rate_weekend, extra_member_rate, created_at'

export const LESSON_LIST_SELECT = `
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
  created_at,
  member:members(id, name, phone, sport, age, birth_date),
  instructor:instructors(id, name, calendar_color),
  session_package:session_packages(id, total_sessions, remaining_sessions, is_active)
`

export const LESSON_MUTATION_SELECT = `
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
  created_at,
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
  is_active,
  created_at,
  member:members(id, name, phone)
`

export const SESSION_PACKAGE_DETAIL_SELECT =
  'id, member_id, total_sessions, remaining_sessions, price, paid_at, is_active, created_at, note'

export const SESSION_TRANSACTION_SELECT =
  'id, member_id, session_package_id, lesson_id, instructor_id, delta, reason, created_at'
