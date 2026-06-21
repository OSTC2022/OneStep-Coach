export type MemberBackupStatus = {
  configured: boolean
  googleConnected: boolean
  googleEmail: string | null
  enabled: boolean
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastFileName: string | null
  lastFileUrl: string | null
  driveFolderName: string | null
}
