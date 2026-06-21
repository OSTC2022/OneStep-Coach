const STORAGE_PREFIX = 'member-detail-patch:'

export type MemberDetailPatch = {
  birth_date?: string | null
  age?: number | null
  grade?: string | null
  school?: string | null
  name?: string
  phone?: string | null
  parent_phone?: string | null
  sport?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  goal?: string | null
  injury_history?: string | null
  memo?: string | null
  primary_instructor_id?: string | null
  primary_instructor?: { id: string; name: string } | null
}

function readPatch(memberId: string): MemberDetailPatch | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${memberId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MemberDetailPatch
  } catch {
    return null
  }
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? ''
}

export function toNullableTrimmed(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeBirthDate(value: string | null | undefined) {
  return value?.split('T')[0] ?? ''
}

function patchMatchesServer(
  member: Record<string, unknown>,
  patch: MemberDetailPatch,
): boolean {
  if (
    patch.grade !== undefined &&
    normalizeText(member.grade as string | null) !== normalizeText(patch.grade)
  ) {
    return false
  }
  if (
    patch.school !== undefined &&
    normalizeText(member.school as string | null) !== normalizeText(patch.school)
  ) {
    return false
  }
  if (
    patch.birth_date !== undefined &&
    normalizeBirthDate(member.birth_date as string | null) !==
      normalizeBirthDate(patch.birth_date)
  ) {
    return false
  }
  if (patch.age !== undefined && member.age !== patch.age) return false
  if (patch.name !== undefined && member.name !== patch.name) return false
  if (
    patch.phone !== undefined &&
    normalizeText(member.phone as string | null) !== normalizeText(patch.phone)
  ) {
    return false
  }
  if (
    patch.parent_phone !== undefined &&
    normalizeText(member.parent_phone as string | null) !==
      normalizeText(patch.parent_phone)
  ) {
    return false
  }
  if (
    patch.sport !== undefined &&
    normalizeText(member.sport as string | null) !== normalizeText(patch.sport)
  ) {
    return false
  }
  if (patch.height_cm !== undefined && member.height_cm !== patch.height_cm) return false
  if (patch.weight_kg !== undefined && member.weight_kg !== patch.weight_kg) return false
  if (
    patch.primary_instructor_id !== undefined &&
    (member.primary_instructor_id as string | null) !== patch.primary_instructor_id
  ) {
    return false
  }
  return true
}

export function stashMemberDetailPatch(memberId: string, patch: MemberDetailPatch) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`${STORAGE_PREFIX}${memberId}`, JSON.stringify(patch))
}

export function clearMemberDetailPatch(memberId: string) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(`${STORAGE_PREFIX}${memberId}`)
}

/** @deprecated use mergeMemberWithDetailPatch */
export function consumeMemberDetailPatch(memberId: string): MemberDetailPatch | null {
  const patch = readPatch(memberId)
  if (patch) clearMemberDetailPatch(memberId)
  return patch
}

export function mergeMemberWithDetailPatch<T extends Record<string, unknown>>(
  member: T,
  memberId: string,
): T {
  const patch = readPatch(memberId)
  if (!patch) return member

  if (patchMatchesServer(member, patch)) {
    clearMemberDetailPatch(memberId)
    return member
  }

  return { ...member, ...patch }
}
