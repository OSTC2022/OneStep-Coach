'use server'

import { getCenterSettings } from '@/lib/actions/center-settings'
import { getMemberForCurrentUser, requireAuth } from '@/lib/actions/auth'
import {
  buildCenterContactView,
  buildCoachContactView,
  type MemberCenterContactView,
  type MemberCoachContactView,
} from '@/lib/center-contact'

export type MemberPortalContactPayload = {
  coach: MemberCoachContactView
  center: MemberCenterContactView
}

/** 회원 포털 헤더 — 코치·센터 연락 팝업용 */
export async function getMemberPortalContact(): Promise<MemberPortalContactPayload | null> {
  await requireAuth()
  const member = await getMemberForCurrentUser()
  const centerSettings = await getCenterSettings()
  const center = buildCenterContactView(centerSettings)

  if (!member) {
    return {
      coach: buildCoachContactView('자율배정', null, center.showInstructorContact),
      center,
    }
  }

  const instructor = member.primary_instructor
  return {
    coach: buildCoachContactView(
      instructor?.name ?? '자율배정',
      instructor?.phone,
      center.showInstructorContact,
    ),
    center,
  }
}
