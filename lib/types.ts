// Database types for OneStep Coach

export type UserRole = 'admin' | 'instructor' | 'member' | 'guardian'
export type ProfileRole = 'admin' | 'coach' | 'member' | 'guardian'
export type ProfileApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  approval_status: ProfileApprovalStatus
  created_at: string
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: ProfileRole
  approval_status: ProfileApprovalStatus
  created_at: string
  updated_at?: string
}

export interface Instructor {
  id: string
  user_id: string | null
  name: string
  phone: string | null
  kakao_id: string | null
  instagram_id: string | null
  blog_url: string | null
  speciality: string[]
  hourly_rate_weekday: number
  hourly_rate_weekend: number
  extra_member_rate: number
  calendar_color: string | null
  is_active: boolean
  created_at: string
}

export interface Member {
  id: string
  user_id: string | null
  auth_user_id: string | null
  name: string
  age: number | null
  birth_date: string | null
  grade: string | null
  school: string | null
  phone: string | null
  parent_phone: string | null
  kakao_id: string | null
  instagram_id: string | null
  sport: string | null
  height_cm: number | null
  weight_kg: number | null
  bmi: number | null
  goal: string | null
  injury_history: string | null
  memo: string | null
  primary_instructor_id: string | null
  remaining_sessions: number
  registered_at: string
  is_active: boolean
  created_at: string
  deleted_at: string | null
  // Joined fields
  primary_instructor?: Instructor
}

export interface SessionPackage {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  price: number | null
  paid_at: string | null
  expires_at: string | null
  payment_method: string | null
  note: string | null
  is_active: boolean
  created_at: string
  deleted_at: string | null
  // Joined fields
  member?: Member
}

export interface Signature {
  id: string
  member_id: string
  lesson_id: string | null
  signature_data: string
  signed_at: string
}

export type AttendanceStatus = 'present' | 'absent' | 'makeup' | 'cancelled'

export interface Lesson {
  id: string
  member_id: string | null
  instructor_id: string | null
  session_package_id: string | null
  lesson_date: string
  start_time: string | null
  end_time: string | null
  lesson_type: string
  title: string | null
  content: string | null
  calendar_font_size: number | null
  special_note: string | null
  attendance_status: AttendanceStatus
  session_deducted: boolean
  lesson_no: number | null
  signature_id: string | null
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
  created_at: string
  created_by: string | null
  // Joined fields
  member?: Member
  instructor?: Instructor
  session_package?: SessionPackage
  signature?: Signature
}

// Form types
export interface MemberFormData {
  name: string
  birth_date?: string
  age?: number
  grade?: string
  school?: string
  phone?: string
  parent_phone?: string
  kakao_id?: string
  instagram_id?: string
  sport?: string
  height_cm?: number
  weight_kg?: number
  goal?: string
  injury_history?: string
  memo?: string
  primary_instructor_id?: string
}

export interface SessionPackageFormData {
  member_id: string
  total_sessions: number
  price?: number
  paid_at?: string | null
  expires_at?: string | null
  payment_method?: string
  note?: string
}

export interface LessonFormData {
  member_id?: string | null
  title?: string | null
  instructor_id?: string
  session_package_id?: string
  lesson_date: string
  start_time?: string
  end_time?: string
  lesson_type?: string
  content?: string
  special_note?: string
  attendance_status?: AttendanceStatus
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
}

export interface CenterSettings {
  id: string
  name: string
  kakao_id: string | null
  instagram_id: string | null
  blog_url: string | null
  updated_at: string
}

export interface InstructorFormData {
  name: string
  phone?: string
  kakao_id?: string
  instagram_id?: string
  blog_url?: string
  speciality?: string[]
  hourly_rate_weekday?: number
  hourly_rate_weekend?: number
  extra_member_rate?: number
  calendar_color?: string | null
  user_id?: string
}

// Dashboard stats
export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  todayLessons: number
  monthlyRevenue: number
  expiringPackages: number
  lowSessionMembers: number
}

// Report types
export interface InstructorReport {
  instructor: Instructor
  /** 출석 처리된 개별 수업(회원) 수 */
  totalLessons: number
  /** 평일 시간대(타임) 수 */
  weekdayLessons: number
  /** 주말·공휴일 시간대(타임) 수 */
  weekendLessons: number
  /** 2명 이상인 타임 수 */
  groupLessons: number
  totalEarnings: number
  weekdayEarnings?: number
  weekendEarnings?: number
  paySlots?: Array<{
    lessonDate: string
    startTime: string
    memberCount: number
    isWeekendOrHoliday: boolean
    pay: number
  }>
}

export interface MemberReport {
  member: Member
  totalLessons: number
  remainingSessions: number
  attendanceRate: number
  lastLessonDate: string | null
}

export type LessonSessionStatus = 'scheduled' | 'present' | 'absent' | 'makeup' | 'cancelled'

export interface LessonSession {
  id: string
  lesson_id: string | null
  member_id: string
  instructor_id: string | null
  session_package_id: string | null
  session_date: string
  checked_in_at: string | null
  checked_in_by: string | null
  status: LessonSessionStatus
  notes: string | null
  signature_url: string | null
  signature_data: string | null
  session_deducted: boolean
  created_at: string
  updated_at: string
  lesson?: Lesson
  member?: Member
  instructor?: Instructor
}

export interface SessionTransaction {
  id: string
  member_id: string
  session_package_id: string | null
  lesson_session_id: string | null
  delta: number
  balance_after: number
  reason: string
  note: string | null
  created_by: string | null
  created_at: string
}
