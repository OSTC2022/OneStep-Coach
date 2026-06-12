'use client'

import { useCallback, useEffect, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getMemberBodyShareUrl } from '@/lib/actions/member-body-share'
import { cn } from '@/lib/utils'

interface MemberBodyShareCopyButtonProps {
  memberId: string
  className?: string
}

export function MemberBodyShareCopyButton({
  memberId,
  className,
}: MemberBodyShareCopyButtonProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadShareUrl = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const result = await getMemberBodyShareUrl(memberId)
    if (result.url) {
      setShareUrl(result.url)
    } else {
      setShareUrl(null)
      setLoadError(result.error ?? '링크를 만들 수 없습니다.')
    }
    setLoading(false)
    return result
  }, [memberId])

  useEffect(() => {
    void loadShareUrl()
  }, [loadShareUrl])

  async function copyShareUrl() {
    let url = shareUrl
    if (!url) {
      const result = await loadShareUrl()
      url = result.url ?? null
      if (!url) {
        toast.error(result.error ?? loadError ?? '링크를 만들 수 없습니다.')
        return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success('공유 링크를 복사했습니다.')
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  function handleCopyClick() {
    if (loading) return
    void copyShareUrl()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary',
            className,
          )}
          disabled={loading}
          onClick={handleCopyClick}
          aria-label="외부 공유 링크 복사"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[220px] text-xs">
        <p>외부 공유 링크 복사</p>
        <p className="mt-0.5 text-muted-foreground">
          그래프·요약만 보기 (읽기 전용)
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
