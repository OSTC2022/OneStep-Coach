/** 성인 러닝 리그 랭킹 등 회원 간 공개 목록용 표시 이름 */
export function maskMemberNameForRanking(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed || '회원'
}

export function formatRankingMemberName(
  name: string | null | undefined,
  _options?: { isMe?: boolean },
): string {
  return maskMemberNameForRanking(name)
}
