'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth, getMemberForCurrentUser } from './auth'
import { loadMemberPortalData } from '@/lib/member-portal-data'

export async function getMemberPortalData() {
  await requireAuth()
  const member = await getMemberForCurrentUser()
  if (!member) return null
  return loadMemberPortalData(member)
}

export async function getMemberPortalDataForStaff(memberId: string) {
  const { getMember } = await import('@/lib/actions/members')
  const { getMemberLinkedProfileRole } = await import('@/lib/actions/member-account')
  const { requireMemberViewer } = await import('@/lib/auth/member-access')

  await requireMemberViewer()
  const linkedRole = await getMemberLinkedProfileRole(memberId)
  if (linkedRole !== 'adult_member') return null

  const member = await getMember(memberId)
  if (!member) return null

  return loadMemberPortalData(member)
}

export async function getMemberRemainingSessions(memberId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('members')
    .select('remaining_sessions')
    .eq('id', memberId)
    .single()

  if (data?.remaining_sessions != null) return data.remaining_sessions

  const { data: packages } = await supabase
    .from('session_packages')
    .select('remaining_sessions')
    .eq('member_id', memberId)
    .eq('is_active', true)

  return (packages ?? []).reduce(
    (sum, pkg) => sum + (pkg.remaining_sessions ?? 0),
    0,
  )
}
