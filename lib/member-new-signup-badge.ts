export const NEW_MEMBER_BADGE_DURATION_MS = 24 * 60 * 60 * 1000

export function resolveNewMemberBadgeUntil(from = Date.now()): string {
  return new Date(from + NEW_MEMBER_BADGE_DURATION_MS).toISOString()
}

export function isNewMemberBadgeActive(
  badgeUntil: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!badgeUntil) return false
  const untilMs = new Date(badgeUntil).getTime()
  if (!Number.isFinite(untilMs)) return false
  return untilMs > now
}
