'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CloudUpload, Download, HardDrive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

function downloadBase64Excel(base64: string, fileName: string) {
  const binary = atob(base64)
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
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function MemberBackupHeaderMenu({ className }: { className?: string }) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const busy = isUploading || isDownloading

  async function handleDriveBackup() {
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
      }
      if (!result.ok) {
        toast.error('Drive 백업 실패', { description: result.error })
        return
      }
      toast.success('Google Drive 백업 완료', {
        description: `회원 ${result.memberCount}명 · 출석 ${result.attendanceCount}건`,
      })
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
        memberCount?: number
        attendanceCount?: number
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
        toast.error('엑셀 다운로드 실패', {
          description: [
            result.error,
            result.deployRev ? `(배포 ${result.deployRev})` : null,
            result.backupApiRev ? `[${result.backupApiRev}]` : null,
          ]
            .filter(Boolean)
            .join(' '),
        })
        return
      }
      downloadBase64Excel(result.data, result.fileName)
      toast.success('엑셀 다운로드 완료', {
        description: `회원 ${result.memberCount}명 · 출석 ${result.attendanceCount}건`,
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 shrink-0 gap-1.5 px-2.5', className)}
          disabled={busy}
          aria-label="회원 데이터보내기"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <HardDrive className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden sm:inline">보내기</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          회원·세션·출석 엑셀
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={busy}
          onClick={() => void handleDriveBackup()}
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CloudUpload className="mr-2 h-4 w-4" />
          )}
          Google Drive 백업
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onClick={() => void handleDownload()}
        >
          {isDownloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          PC로 다운로드
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/backup" className="text-xs text-muted-foreground">
            백업 설정
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
