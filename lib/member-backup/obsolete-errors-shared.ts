/** 클라이언트·서버 공용 — obsolete 백업 오류 판별 */
export const OBSOLETE_BACKUP_ERROR_MARKERS = [
  ['create', 'Admin', 'Client', ' is not defined'].join(''),
] as const

export function isObsoleteBackupError(message: string | null | undefined): boolean {
  if (!message) return false
  return OBSOLETE_BACKUP_ERROR_MARKERS.some((marker) => message.includes(marker))
}
