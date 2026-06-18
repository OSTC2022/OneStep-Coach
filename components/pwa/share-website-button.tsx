'use client'

import { Share2 } from 'lucide-react'
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

type ShareWebsiteButtonProps = {
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  showLabel?: boolean
}

async function copyLoginUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch {
      document.body.removeChild(textarea)
      return false
    }
  }
}

export function ShareWebsiteButton({
  className,
  variant = 'outline',
  size = 'sm',
  showLabel = false,
}: ShareWebsiteButtonProps) {
  async function handleShare() {
    const url = getShareLoginUrl()

    const copied = await copyLoginUrl(url)
    if (copied) {
      toast.success('로그인 주소가 복사되었습니다.')
      return
    }

    if (navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }

    toast.error('링크 복사에 실패했습니다.')
  }

  const button = (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? size : 'icon'}
      className={cn(showLabel ? undefined : 'h-9 w-9', className)}
      onClick={() => void handleShare()}
      aria-label="로그인 주소 복사"
    >
      <Share2 className={cn('h-4 w-4', showLabel && 'sm:mr-1.5')} />
      {showLabel ? <span className="hidden sm:inline">링크 복사</span> : null}
    </Button>
  )

  if (showLabel) return button

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">로그인 주소 복사</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
