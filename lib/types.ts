// Database types for OneStep Coach

export type UserRole = 'admin' | 'instructor' | 'member' | 'guardian' | 'adult_member'
export type ProfileRole = 'admin' | 'coach' | 'member' | 'guardian' | 'adult_member'
export type ProfileApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  approval_status: ProfileApprovalStatus
  created_at: string
  avatar_url?: string | null
  phone?: string | null
  kakao_id?: string | null
  instagram_id?: string | null
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: ProfileRole
  approval_status: ProfileApprovalStatus
  created_at: string
  updated_at?: string
  avatar_url?: string | null
  phone?: string | null
  kakao_id?: string | null
  instagram_id?: string | null
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
  member_login_enabled?: boolean
  member_invite_code?: string | null
  last_login_at?: string | null
  invite_email?: string | null
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
  gender?: 'male' | 'female' | null
  height_cm: number | null
  weight_kg: number | null
  bmi: number | null
  goal: string | null
  injury_history: string | null
  memo: string | null
  primary_instructor_id: string | null
  remaining_sessions: number
  registered_at: string
  body_baseline_recorded_at?: string | null
  body_share_token?: string | null
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
  google_event_id?: string | null
  google_sync_status?: string | null
  recurrence_group_id?: string | null
  recurrence_pattern?: string | null
  event_type?: 'single' | 'recurring_master' | 'exception' | 'materialized' | null
  recurrence?: string[] | null
  recurring_master_id?: string | null
  google_calendar_id?: string | null
  google_account_id?: string | null
  google_ical_uid?: string | null
  google_recurring_event_id?: string | null
  original_start_time?: string | null
  event_timezone?: string | null
  event_status?: 'confirmed' | 'cancelled' | null
  created_at: string
  created_by: string | null
  app_modified_at?: string | null
  google_event_updated_at?: string | null
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
  gender?: 'male' | 'female' | null
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
  event_type?: 'single' | 'recurring_master' | 'exception' | 'materialized' | null
  recurrence?: string[] | null
}

export interface CenterSettings {
  id: string
  name: string
  kakao_id: string | null
  instagram_id: string | null
  blog_url: string | null
  center_phone?: string | null
  naver_place_url?: string | null
  center_address?: string | null
  business_hours?: string | null
  show_instructor_contact?: boolean
  updated_at: string
}

export type CenterBoardKind = 'notice' | 'event'
export type CenterBoardAudience = 'general' | 'adult'
export type CenterBoardEventSubtype = 'mileage_challenge' | 'running_league' | null

export interface CenterBoardPost {
  id: string
  kind: CenterBoardKind
  audience: CenterBoardAudience
  title: string
  body: string
  link_url: string | null
  event_starts_at: string | null
  event_ends_at: string | null
  event_subtype: CenterBoardEventSubtype
  challenge_goal_km: number | null
  is_published: boolean
  pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RunningLeagueStatus = 'draft' | 'active' | 'closed'

/** draft=예정, active=진행중, closed=종료 */
export type RunningLeagueAudience = 'adult'

export type RunningLeagueTargetGroup =
  | 'all'
  | 'beginner'
  | '5km'
  | '10km'
  | 'half_marathon'

export type RunningLeagueMemberLevel = 'beginner' | 'elementary' | 'intermediate' | 'race_prep'

export type RunningLeagueGoalType =
  | 'finish'
  | 'record_improvement'
  | 'attendance'
  | 'mileage'
  | 'health'
  | 'race_prep'

export type RunningLeagueDistanceEvent = '1km' | '3km' | '5km' | '10km' | 'half' | 'full'
export type RunningLeagueRecordPhase =
  | 'month_start'
  | 'month_end'
  | 'mid_month'
  | 'other'
  | 'pb_history'
export type RunningLeagueMileageSource = 'manual' | 'lesson' | 'import' | 'other'
export type RunningLeagueRecoveryCheckType =
  | 'stretching'
  | 'pain_check'
  | 'condition_check'
  | 'recovery_jog'
  | 'intensity_compliance'

export type RecoveryCondition = 'good' | 'normal' | 'tired'
export type RecoveryPain = 'none' | 'mild' | 'severe'
export type RecoveryStretching = 'done' | 'not_done'
export type RecoveryIntensity = 'light' | 'moderate' | 'hard' | 'excessive'
export type RecoveryCoachCompliance = 'followed' | 'slightly_fast' | 'excessive'
export type RunningLeagueScoreSource = 'manual' | 'auto' | 'import'

export interface RunningLeague {
  id: string
  title: string
  description: string
  starts_at: string
  ends_at: string
  status: RunningLeagueStatus
  audience: RunningLeagueAudience
  target_group: RunningLeagueTargetGroup
  board_post_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RunningLeagueParticipant {
  id: string
  league_id: string
  member_id: string
  goal_level: string | null
  goal_type: RunningLeagueGoalType | null
  personal_goal: string | null
  goal_achievement_rate: number | null
  attendance_score: number
  goal_score: number
  record_score: number
  mileage_score: number
  recovery_score: number
  mileage_km: number
  total_score: number
  record_baseline: string | null
  record_current: string | null
  notes: string
  coach_comment: string
  created_at: string
  updated_at: string
  member?: Pick<Member, 'id' | 'name' | 'sport' | 'phone' | 'gender'> | null
}

export interface RunningLeagueGoal {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  goal_level: string | null
  goal_type: RunningLeagueGoalType | null
  personal_goal: string
  achievement_rate: number | null
  goal_score: number
  week_number: number | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface RunningLeagueRecord {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  distance_event: RunningLeagueDistanceEvent
  record_phase: RunningLeagueRecordPhase
  time_text: string | null
  time_seconds: number | null
  measured_at: string
  notes: string
  created_at: string
  updated_at: string
}

export interface RunningLeagueMileageLog {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  distance_km: number
  logged_at: string
  source: RunningLeagueMileageSource
  notes: string
  duration?: string | null
  pace?: string | null
  heart_rate?: number | null
  calories?: number | null
  activity_time?: string | null
  source_app?: string | null
  screenshot_url?: string | null
  image_hash?: string | null
  extraction_confidence?: number | null
  extraction_raw_json?: Record<string, unknown> | null
  verification_status?: string | null
  created_at: string
  updated_at: string
}

export interface RunningLeagueRecoveryLog {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  check_type: RunningLeagueRecoveryCheckType
  completed: boolean
  points: number
  logged_at: string
  notes: string
  created_at: string
  updated_at: string
}

export interface RunningLeagueDailyRecovery {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  logged_at: string
  condition: RecoveryCondition
  pain: RecoveryPain
  stretching: RecoveryStretching
  intensity: RecoveryIntensity
  coach_compliance: RecoveryCoachCompliance
  points: number
  created_at: string
  updated_at: string
}

export interface RunningLeagueScoreSnapshot {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  attendance_score: number
  goal_score: number
  record_score: number
  mileage_score: number
  recovery_score: number
  total_score: number
  week_number: number | null
  source: RunningLeagueScoreSource
  created_at: string
  updated_at: string
}

export interface RunningLeagueAward {
  id: string
  league_id: string
  participant_id: string
  member_id: string
  award_key: string
  award_name: string
  criteria: string
  reason: string
  is_recommended: boolean
  is_confirmed: boolean
  created_at: string
  updated_at: string
}

export interface RunningLeagueReport {
  id: string
  participant_id: string
  league_id: string
  member_id: string
  rank: number | null
  total_score: number | null
  summary: string
  highlights: string[]
  coach_comment: string
  is_published: boolean
  published_at: string | null
  created_at: string
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
