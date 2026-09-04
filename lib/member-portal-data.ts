import { getCenterSettings } from '@/lib/actions/center-settings'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import {
  getLessonSessionsForMember,
  getNextLessonForMember,
  getSessionTransactionsForMember,
} from '@/lib/actions/lesson-sessions'
import { getLessons } from '@/lib/actions/lessons'
import { getSessionPackages } from '@/lib/actions/sessions'
import {
  buildCenterContactView,
  buildCoachContactView,
} from '@/lib/center-contact'
import { buildMemberPortalSessionStatus } from '@/lib/member-portal-session-status'
import { buildMemberPortalSummary } from '@/lib/member-portal-summary'
import type { MemberPortalData } from '@/lib/member-portal-types'
import {
  isAttendanceKingQualifiedLog,
  resolveAttendanceDayKey,
} from '@/lib/running-league/attendance-king'
import { toVisibleSnsAccount } from '@/lib/sns-account'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import type { Lesson, LessonSession, Member } from '@/lib/types'

function maxDateKey(dates: Array<string | null | undefined>): string | null {
  let best: string | null = null
  for (const raw of dates) {
    if (!raw) continue
    const key = resolveAttendanceDayKey(raw)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    if (!best || key > best) best = key
  }
  return best
}

/** 강사·회원 오프라인 출석(출석왕) + 수업 출석 중 가장 최근 일자 */
function resolveRecentAttendanceDate(
  recentSessions: LessonSession[],
  recentLessons: Lesson[],
  portalAttendanceDates: string[],
): string | null {
  const presentSessionDates = recentSessions
    .filter((session) => session.status === 'present' || Boolean(session.checked_in_at))
    .map((session) => session.session_date)

  const presentLessonDates = recentLessons
    .filter((lesson) => lesson.attendance_status === 'present')
    .map((lesson) => lesson.lesson_date)

  return maxDateKey([
    ...portalAttendanceDates,
    ...presentSessionDates,
    ...presentLessonDates,
  ])
}

/** 러닝 포털 출석(오프라인 수업·3km+ 출석 인정) 최근 일자 */
async function fetchPortalAttendanceDates(memberId: string): Promise<string[]> {
  try {
    const supabase = await createStaffDataClient()
    const { data, error } = await supabase
      .from('running_league_mileage_logs')
      .select('logged_at, distance_km, notes')
      .eq('member_id', memberId)
      .order('logged_at', { ascending: false })
      .limit(60)

    if (error) {
      console.error('fetchPortalAttendanceDates:', error.message)
      return []
    }

    const dates: string[] = []
    for (const row of data ?? []) {
      if (
        !isAttendanceKingQualifiedLog({
          distance_km: Number(row.distance_km ?? 0),
          notes: row.notes,
        })
      ) {
        continue
      }
      dates.push(resolveAttendanceDayKey(String(row.logged_at)))
      if (dates.length >= 10) break
    }

    return dates
  } catch (error) {
    console.error('fetchPortalAttendanceDates:', error)
    return []
  }
}

export async function loadMemberPortalData(member: Member): Promise<MemberPortalData> {
  const [
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
    centerSettings,
    bodyData,
    packagesResult,
    portalAttendanceDates,
  ] = await Promise.all([
    getNextLessonForMember(member.id),
    getLessons({ memberId: member.id, limit: 10, upToNow: true }),
    getLessonSessionsForMember(member.id, 10),
    getSessionTransactionsForMember(member.id, 15),
    getCenterSettings(),
    getMemberBodyRecords(member.id, {
      weight_kg: member.weight_kg,
      height_cm: member.height_cm,
      registered_at: member.registered_at,
      body_baseline_recorded_at: member.body_baseline_recorded_at,
    }),
    getSessionPackages({ memberId: member.id }),
    fetchPortalAttendanceDates(member.id),
  ])

  const instructor = member.primary_instructor
  const centerContact = buildCenterContactView(centerSettings)
  const coachContact = buildCoachContactView(
    instructor?.name ?? '자율배정',
    instructor?.phone,
    centerContact.showInstructorContact,
  )

  return {
    member,
    instructorAccount: instructor
      ? toVisibleSnsAccount(instructor.name, {
          kakaoId: instructor.kakao_id,
          instagramId: instructor.instagram_id,
          blogUrl: instructor.blog_url,
        })
      : null,
    centerAccount: toVisibleSnsAccount(centerSettings.name, {
      kakaoId: centerSettings.kakao_id,
      instagramId: centerSettings.instagram_id,
      blogUrl: centerSettings.blog_url,
    }),
    centerContact,
    coachContact,
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
    bodyRecords: bodyData.records,
    bodyTableReady: bodyData.tableReady,
    summary: buildMemberPortalSummary(
      bodyData.records,
      resolveRecentAttendanceDate(
        recentSessions,
        recentLessons,
        portalAttendanceDates,
      ),
    ),
    sessionStatus: buildMemberPortalSessionStatus(member, packagesResult.data),
  }
}
