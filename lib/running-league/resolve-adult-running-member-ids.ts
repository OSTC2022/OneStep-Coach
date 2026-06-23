import type { ProfileRole } from '@/lib/types'
import {
  isAdultRunningLeagueMember,
  type AdultRunningMemberRecord,
} from '@/lib/running-league/adult-running-eligibility'

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[],
      ) => Promise<{
        data: Array<Record<string, unknown>> | null
        error: { message: string } | null
      }>
    }
  }
}

/** 리그 랭킹에 포함할 성인 러닝 회원 member_id 집합 */
export async function resolveAdultRunningMemberIds(
  supabase: SupabaseLike,
  memberIds: string[],
): Promise<Set<string>> {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Set()

  const { data: memberRows, error: memberError } = await supabase
    .from('members')
    .select('id, auth_user_id, user_id, sport, grade')
    .in('id', uniqueIds)

  if (memberError) throw new Error(memberError.message)
  if (!memberRows?.length) return new Set()

  const members = memberRows as AdultRunningMemberRecord[]
  const linkedUserIds = [
    ...new Set(
      members
        .map((row) => row.auth_user_id ?? row.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const profileRoleByUserId = new Map<string, ProfileRole>()
  if (linkedUserIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .in('id', linkedUserIds)

    if (profileError) throw new Error(profileError.message)
    for (const row of profileRows ?? []) {
      const id = String(row.id)
      const role = row.role as ProfileRole | undefined
      if (role) profileRoleByUserId.set(id, role)
    }
  }

  const adultIds = new Set<string>()
  for (const member of members) {
    if (isAdultRunningLeagueMember(member, profileRoleByUserId)) {
      adultIds.add(member.id)
    }
  }

  return adultIds
}
