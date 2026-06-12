// OneStep Coach Database Types

export type UserRole = 'admin' | 'instructor' | 'member'

export interface User {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Instructor {
  id: string
  user_id: string | null
  name: string
  phone: string | null
  kakao_id: string | null
  instagram_id: string | null
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
  registered_at: string
  body_baseline_recorded_at: string | null
  body_share_token?: string | null
  is_active: boolean
  created_at: string
  deleted_at: string | null
  // Joined relations
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
  // Joined relations
  member?: Member
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
  special_note: string | null
  attendance_status: AttendanceStatus
  session_deducted: boolean
  lesson_no: number | null
  signature_id: string | null
  recurrence_group_id: string | null
  recurrence_pattern: string | null
  created_at: string
  created_by: string | null
  // Joined relations
  member?: Member
  instructor?: Instructor
  session_package?: SessionPackage
  signature?: Signature
  lesson_sessions?: Array<{ checked_in_at: string | null }> | null
}

export interface Signature {
  id: string
  member_id: string
  lesson_id: string | null
  signature_data: string
  signed_at: string
}

// Form types for creating/updating records
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
  paid_at?: string
  expires_at?: string
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
}

// Dashboard statistics
export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  todayLessons: number
  monthlyRevenue: number
  expiringSessions: number
  instructorCount: number
}
