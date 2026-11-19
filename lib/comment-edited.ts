/** created_at과 updated_at이 2초 이상 차이나면 수정된 댓글로 본다 */
export function isCommentEdited(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
) {
  if (!createdAt || !updatedAt) return false
  const created = Date.parse(createdAt)
  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false
  return updated - created > 2000
}

export function formatCommentEditedAt(updatedAt: string) {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
