function maskNameToken(token: string): string {
  const chars = Array.from(token)
  if (chars.length <= 0) return 'OO'
  return `${chars[0]}OO`
}

/** 성인 러닝 리그 랭킹 등 회원 간 공개 목록용 이름 마스킹 */
export function maskMemberNameForRanking(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '회원'

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return parts.map(maskNameToken).join(' ')
  }

  return maskNameToken(trimmed)
}

export function formatRankingMemberName(
  name: string | null | undefined,
  options?: { isMe?: boolean },
): string {
  const trimmed = (name ?? '').trim() || '회원'
  if (options?.isMe) return trimmed
  return maskMemberNameForRanking(trimmed)
}
