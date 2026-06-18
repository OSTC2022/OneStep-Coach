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
import {
  getShareLoginUrl,
  SITE_BRAND_NAME,
  SITE_SHARE_TEXT,
} from '@/lib/site-brand'

type ShareWebsiteButtonProps = {
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  showLabel?: boolean
}

export function ShareWebsiteButton({
  className,
  variant = 'outline',
  size = 'sm',
  showLabel = false,
}: ShareWebsiteButtonProps) {
  async function handleShare() {
    const url = getShareLoginUrl()

    if (navigator.share) {
      try {
        await navigator.share({
          title: SITE_BRAND_NAME,
          text: SITE_SHARE_TEXT,
          url,
        })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('원스텝 웹사이트 링크가 복사되었습니다.')
    } catch {
      toast.error('링크 복사에 실패했습니다.')
    }
  }

  const button = (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? size : 'icon'}
      className={cn(showLabel ? undefined : 'h-9 w-9', className)}
      onClick={() => void handleShare()}
      aria-label="원스텝 웹사이트 링크 공유"
    >
      <Share2 className={cn('h-4 w-4', showLabel && 'sm:mr-1.5')} />
      {showLabel ? <span className="hidden sm:inline">링크 공유</span> : null}
    </Button>
  )

  if (showLabel) return button

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">웹사이트 링크 공유</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
