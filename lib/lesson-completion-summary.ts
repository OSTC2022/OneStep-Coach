export type LessonCompletionRemainingInput = {
  member_remaining_sessions?: number
  session_package_remaining?: number
  session_overage?: number
  no_session_package?: boolean
}

export function formatLessonCompletionRemainingLabel(
  data: LessonCompletionRemainingInput,
): string | null {
  if (data.no_session_package) {
    return '등록된 수업권이 없습니다'
  }

  const overage = data.session_overage ?? 0
  if (overage > 0) {
    return `수업권 ${overage}회 초과`
  }

  const remaining =
    data.session_package_remaining ?? data.member_remaining_sessions

  if (remaining == null || !Number.isFinite(remaining)) {
    return null
  }

  return `남은 수업 ${remaining}회`
}
