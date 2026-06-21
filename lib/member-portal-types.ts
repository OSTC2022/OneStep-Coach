import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import type {
  MemberCenterContactView,
  MemberCoachContactView,
} from '@/lib/center-contact'
import type { MemberPortalSummary } from '@/lib/member-portal-summary'
import type { VisibleSnsAccount } from '@/lib/sns-account'
import type { Lesson, LessonSession, Member, SessionTransaction } from '@/lib/types'

export type { MemberPortalSummary } from '@/lib/member-portal-summary'
export type {
  MemberCenterContactView,
  MemberCoachContactView,
} from '@/lib/center-contact'
export type { VisibleSnsAccount } from '@/lib/sns-account'

export type MemberPortalSessionStatus =
  | {
      kind: 'monthly'
      isUsable: boolean
      remainingPeriodLabel: string
      expiresAt: string | null
      planLabel: string
      daysUntilExpiry: number | null
    }
  | {
      kind: 'count'
      isUsable: boolean
      remainingSessions: number
    }

export type MemberPortalData = {
  member: Member
  instructorAccount: VisibleSnsAccount | null
  centerAccount: VisibleSnsAccount | null
  centerContact: MemberCenterContactView
  coachContact: MemberCoachContactView
  nextLesson: Lesson | null
  recentLessons: Lesson[]
  recentSessions: LessonSession[]
  transactions: SessionTransaction[]
  bodyRecords: MemberBodyRecord[]
  bodyTableReady: boolean
  summary: MemberPortalSummary
  sessionStatus: MemberPortalSessionStatus
}
