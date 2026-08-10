'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getShareLoginUrl } from '@/lib/site-brand'

/** 로그인 주소 공유·내보내기 (시스템 공유 시트 우선) */
export function ExportWebsiteButton({ className }: { className?: string }) {
  async function handleExport() {
    const url = getShareLoginUrl()

    if (navigator.share) {
      try {
        await navigator.share({
          title: '원스텝',
          text: '원스텝 로그인 주소',
          url,
        })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('로그인 주소를 복사했습니다.')
    } catch {
      toast.error('공유에 실패했습니다.')
    }
  }

  const button = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn('h-9 w-9', className)}
      onClick={() => void handleExport()}
      aria-label="내보내기"
    >
      <Download className="h-4 w-4" />
    </Button>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">내보내기</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
