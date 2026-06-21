'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { canAddBodyRecordFor } from '@/lib/auth/member-access'
import { type MemberBodyRecord } from '@/lib/actions/member-body-records'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { buildMemberBodyShareUrl, memberBodySharePath } from '@/lib/member-body-share-url'

export type SharedBodyReportMember = {
  id: string
  name: string
  sport: string | null
  height_cm: number | null
  weight_kg: number | null
  bmi: number | null
  registered_at: string
  body_baseline_recorded_at: string | null
}

export type SharedBodyReportData = {
  member: SharedBodyReportMember
  records: MemberBodyRecord[]
  tableReady: boolean
  wellnessColumnsReady: boolean
  nutritionColumnsReady: boolean
}


async function writeMemberShareToken(memberId: string, token: string | null) {
  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('members')
    .update({ body_share_token: token })
    .eq('id', memberId)
    .is('deleted_at', null)

  if (error?.code === '42703') {
    return {
      error:
        '공유 링크 컬럼이 없습니다. supabase/add-member-body-share-token.sql 을 실행해주세요.',
    }
  }
  if (error) {
    console.error('writeMemberShareToken:', error)
    return { error: '공유 링크 설정에 실패했습니다.' }
  }
  return {}
}

async function ensureShareTokenColumn(admin: ReturnType<typeof createServiceRoleClient>) {
  const { error } = await admin
    .from('members')
    .select('body_share_token')
    .limit(1)
  return !error?.code || error.code !== '42703'
}

export async function getMemberBodyShareUrl(
  memberId: string,
): Promise<{ url?: string; error?: string }> {
  const allowed = await canAddBodyRecordFor(memberId)
  if (!allowed) {
    return { error: '권한이 없습니다.' }
  }

  const admin = createServiceRoleClient()
  const columnReady = await ensureShareTokenColumn(admin)
  if (!columnReady) {
    return {
      error:
        '공유 링크 기능이 준비되지 않았습니다. supabase/add-member-body-share-token.sql 을 실행해주세요.',
    }
  }

  const { data: member, error } = await admin
    .from('members')
    .select('body_share_token')
    .eq('id', memberId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !member) {
    return { error: '회원 정보를 찾을 수 없습니다.' }
  }

  let token = member.body_share_token as string | null
  if (!token) {
    token = randomUUID()
    const write = await writeMemberShareToken(memberId, token)
    if (write.error) return { error: write.error }
  }

  revalidatePath(memberBodySharePath(token))
  return { url: buildMemberBodyShareUrl(token) }
}

export async function rotateMemberBodyShareUrl(
  memberId: string,
): Promise<{ url?: string; error?: string }> {
  const allowed = await canAddBodyRecordFor(memberId)
  if (!allowed) {
    return { error: '권한이 없습니다.' }
  }

  const token = randomUUID()
  const write = await writeMemberShareToken(memberId, token)
  if (write.error) return { error: write.error }

  revalidatePath(memberBodySharePath(token))
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/my/body')
  return { url: buildMemberBodyShareUrl(token) }
}

export async function getSharedBodyReportByToken(
  token: string,
): Promise<SharedBodyReportData | null> {
  if (!token || token.length < 8) return null

  const admin = createServiceRoleClient()
  const columnReady = await ensureShareTokenColumn(admin)
  if (!columnReady) return null

  const { data: member, error } = await admin
    .from('members')
    .select(
      'id, name, sport, height_cm, weight_kg, bmi, registered_at, body_baseline_recorded_at, body_share_token',
    )
    .eq('body_share_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !member || member.body_share_token !== token) {
    return null
  }

  return fetchSharedBodyReport(member, admin)
}

async function fetchSharedBodyReport(
  member: SharedBodyReportMember & { body_share_token?: string | null },
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<SharedBodyReportData> {
  const { data, error } = await admin
    .from('member_body_records')
    .select(
      'id, member_id, recorded_at, weight_kg, height_cm, note, created_at, sleep_hours, condition, fatigue, muscle_soreness, pain_area, pain_level, pain_area_note, meal_status, protein_status, protein_target_g, protein_intake_g, protein_goal_multiplier, protein_intake_by_slot, post_workout_meal_status, hydration_status, supplement_status, nutrition_note',
    )
    .eq('member_id', member.id)
    .order('recorded_at', { ascending: true })

  let records: MemberBodyRecord[] = (data ?? []) as MemberBodyRecord[]
  let tableReady = true
  let wellnessColumnsReady = !error
  let nutritionColumnsReady = !error

  if (error?.code === '42P01') {
    tableReady = false
    records = []
    wellnessColumnsReady = false
    nutritionColumnsReady = false
  } else if (error) {
    const fallback = await admin
      .from('member_body_records')
      .select('id, member_id, recorded_at, weight_kg, height_cm, note, created_at')
      .eq('member_id', member.id)
      .order('recorded_at', { ascending: true })
    records = (fallback.data ?? []) as MemberBodyRecord[]
    wellnessColumnsReady = false
    nutritionColumnsReady = false
  }

  if (
    records.length === 0 &&
    member.weight_kg != null &&
    member.registered_at
  ) {
    const baselineDate = member.body_baseline_recorded_at ?? member.registered_at
    records = [
      {
        id: `bootstrap-${member.id}`,
        member_id: member.id,
        recorded_at: baselineDate,
        weight_kg: member.weight_kg,
        height_cm: member.height_cm,
        note: null,
        created_at: member.registered_at,
      } as MemberBodyRecord,
    ]
  }

  return {
    member: {
      id: member.id,
      name: member.name,
      sport: member.sport,
      height_cm: member.height_cm,
      weight_kg: member.weight_kg,
      bmi: member.bmi,
      registered_at: member.registered_at,
      body_baseline_recorded_at: member.body_baseline_recorded_at,
    },
    records,
    tableReady,
    wellnessColumnsReady,
    nutritionColumnsReady,
  }
}
