export type LessonCompletionRemainingInput = {
  member_remaining_sessions?: number
  session_package_remaining?: number
  session_overage?: number
  no_session_package?: boolean
}

export function formatLessonCompletionRemainingLabel(
  data: LessonCompletionRemainingInput,
): string | null {
  const memberRemaining = data.member_remaining_sessions

  if (
    data.no_session_package &&
    (memberRemaining == null || memberRemaining <= 0)
  ) {
    return '등록된 수업권이 없습니다'
  }

  if (memberRemaining != null && Number.isFinite(memberRemaining)) {
    if (memberRemaining < 0) {
      return `수업권 ${Math.abs(memberRemaining)}회 초과`
    }
    return `남은 수업 ${memberRemaining}회`
  }

  const overage = data.session_overage ?? 0
  if (overage > 0) {
    return `수업권 ${overage}회 초과`
  }

  const packageRemaining = data.session_package_remaining
  if (packageRemaining != null && Number.isFinite(packageRemaining)) {
    if (packageRemaining < 0) {
      return `수업권 ${Math.abs(packageRemaining)}회 초과`
    }
    return `남은 수업 ${packageRemaining}회`
  }

  return null
}
