'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'
import {
  CloudUpload,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  setMemberBackupEnabled,
} from '@/lib/actions/member-backup'
import type { MemberBackupStatus } from '@/lib/member-backup/types'
import { isObsoleteBackupError } from '@/lib/member-backup/obsolete-errors-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface MemberBackupPanelProps {
  initialStatus: MemberBackupStatus
}

export function MemberBackupPanel({ initialStatus }: MemberBackupPanelProps) {
  const router = useRouter()
  const [status, setStatus] = useState<MemberBackupStatus>(() => ({
    ...initialStatus,
    lastError: isObsoleteBackupError(initialStatus.lastError)
      ? null
      : initialStatus.lastError,
  }))
  const [isUploading, setIsUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSavingEnabled, setIsSavingEnabled] = useState(false)

  useEffect(() => {
    if (isObsoleteBackupError(initialStatus.lastError)) {
      setStatus((prev) => ({ ...prev, lastError: null }))
    }
  }, [initialStatus.lastError])

  async function handleRunBackup() {
    setStatus((prev) => ({ ...prev, lastError: null }))
    setIsUploading(true)
    try {
      const response = await fetch('/api/admin/member-backup', {
        method: 'POST',
        cache: 'no-store',
      })
      const result = (await response.json()) as {
        ok: boolean
        error?: string
        memberCount?: number
        attendanceCount?: number
        fileName?: string
        deployRev?: string
        backupApiRev?: string
      }
      if (!result.ok) {
        const description = [
          result.error,
          result.deployRev ? `(배포 ${result.deployRev})` : null,
          result.backupApiRev ? `[${result.backupApiRev}]` : null,
        ]
          .filter(Boolean)
          .join(' ')
        setStatus((prev) => ({
          ...prev,
          lastError: result.error ?? 'Drive 백업에 실패했습니다.',
        }))
        toast.error('Drive 백업 실패', { description })
        router.refresh()
        return
      }
      setStatus((prev) => ({
        ...prev,
        lastError: null,
        lastSuccessAt: new Date().toISOString(),
        lastFileName: result.fileName ?? prev.lastFileName,
      }))
      toast.success('Google Drive 백업 완료', {
        description: `회원 ${result.memberCount}명 · 출석 ${result.attendanceCount}건 · ${result.fileName}`,
      })
      router.refresh()
    } finally {
      setIsUploading(false)
    }
  }

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const response = await fetch('/api/admin/member-backup', {
        cache: 'no-store',
      })
      const result = (await response.json()) as {
        ok?: boolean
        data?: string
        fileName?: string
        error?: string
        deployRev?: string
        backupApiRev?: string
      }
      if (
        !response.ok ||
        result.ok === false ||
        result.error ||
        !result.data ||
        !result.fileName
      ) {
        const description = [
          result.error ?? '엑셀 다운로드 실패',
          result.deployRev ? `(배포 ${result.deployRev})` : null,
          result.backupApiRev ? `[${result.backupApiRev}]` : null,
        ]
          .filter(Boolean)
          .join(' ')
        toast.error('엑셀 다운로드 실패', { description })
        return
      }
      const binary = atob(result.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.fileName
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('엑셀 다운로드 완료')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleToggleEnabled(checked: boolean) {
    setIsSavingEnabled(true)
    try {
      const result = await setMemberBackupEnabled(checked)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setStatus((prev) => ({ ...prev, enabled: checked }))
      toast.success(checked ? '자동 백업을 켰습니다.' : '자동 백업을 껐습니다.')
    } finally {
      setIsSavingEnabled(false)
    }
  }

  return (
    <div className="space-y-4">
      {!status.configured ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Google OAuth 환경 변수가 설정되지 않았습니다. Drive 백업을 사용하려면{' '}
            <code className="text-xs">GOOGLE_CLIENT_ID</code>,{' '}
            <code className="text-xs">GOOGLE_CLIENT_SECRET</code>를 설정해 주세요.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            Google Drive 자동 백업
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            센터 DB에서 엑셀을 만들어 Google Drive{' '}
            <strong>OneStep 회원 백업</strong> 폴더의{' '}
            <strong>회원백업.xlsx</strong> 한 파일에 업로드합니다. 기존 파일이
            있으면 <strong>중복 없이 새 기록만 추가</strong>하고, 이전 월·출석·결제
            내역은 유지합니다. Drive에서 수정해도 앱 데이터는 바뀌지 않습니다.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            자동 백업: 매일 <strong>00:00 (한국 시간)</strong>에 하루 1회 병합
            업로드. 수동 「지금 Drive에 백업」은 언제든 가능합니다.
          </p>

          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">엑셀 시트 구성</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                <strong>회원_요약</strong> — 회원 정보, 세션·결제·출석 요약
              </li>
              <li>
                <strong>출석_내역</strong> — 전체 출석 기록(수업현황과 동일 기준)
              </li>
              <li>
                <strong>YYYY_MM월</strong> — 올해 1월~현재 월별 시트. 출석·결제
                일자, 금액, 구매·남은·사용 횟수, 결제방법 등
              </li>
            </ul>
          </div>

          {!status.googleConnected ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Google 계정 연결이 필요합니다.{' '}
              <Link href="/dashboard/settings/google-calendar" className="underline">
                Google 캘린더 설정
              </Link>
              에서 연결해 주세요. Drive 권한 포함을 위해{' '}
              <strong>한 번 끊었다가 다시 연결</strong>해야 할 수 있습니다.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              연결 계정: {status.googleEmail ?? '(알 수 없음)'}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Switch
              id="backup-enabled"
              checked={status.enabled}
              disabled={isSavingEnabled}
              onCheckedChange={(checked) => void handleToggleEnabled(checked)}
            />
            <Label htmlFor="backup-enabled">매일 자동 백업</Label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleRunBackup()}
              disabled={isUploading || !status.googleConnected}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="mr-2 h-4 w-4" />
              )}
              지금 Drive에 백업
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDownload()}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              PC로 엑셀 받기
            </Button>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {status.lastSuccessAt ? (
              <p>
                마지막 성공:{' '}
                {format(parseISO(status.lastSuccessAt), 'yyyy-MM-dd HH:mm', {
                  locale: ko,
                })}
              </p>
            ) : (
              <p>아직 성공한 백업 기록이 없습니다.</p>
            )}
            {status.driveFolderName ? (
              <p>Drive 폴더: {status.driveFolderName}</p>
            ) : null}
            {status.lastFileName ? (
              <p className="flex flex-wrap items-center gap-1">
                최신 파일: {status.lastFileName}
                {status.lastFileUrl ? (
                  <a
                    href={status.lastFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    열기
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </p>
            ) : null}
            {status.lastError && !isObsoleteBackupError(status.lastError) ? (
              <p className="text-destructive">오류: {status.lastError}</p>
            ) : null}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Vercel Cron 사용 시 환경 변수{' '}
            <code className="text-[10px]">MEMBER_BACKUP_CRON_SECRET</code>을 설정하고,
            Vercel 프로젝트 Cron 설정에서 동일한 Bearer 토큰을 사용하세요.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
