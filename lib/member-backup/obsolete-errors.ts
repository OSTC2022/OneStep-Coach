import 'server-only'

/** 이전 배포에서 DB에 저장된 obsolete 오류 문구 */
export const OBSOLETE_BACKUP_ERROR_MARKERS = [
  ['create', 'Admin', 'Client', ' is not defined'].join(''),
] as const

export function isObsoleteBackupError(message: string | null | undefined): boolean {
  if (!message) return false
  return OBSOLETE_BACKUP_ERROR_MARKERS.some((marker) => message.includes(marker))
}
