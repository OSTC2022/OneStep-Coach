'use client'

import { useState } from 'react'
import { Globe, Instagram, MessageCircle } from 'lucide-react'
import {
  buildBlogUrl,
  buildInstagramUrl,
  hasAnySnsValue,
  hasSnsLinkValue,
  resolveKakaoLink,
} from '@/lib/sns-links'
import { cn } from '@/lib/utils'
import { KakaoPersonalIdDialog } from '@/components/members/sns-id-link'

export type SnsIconLinksProps = {
  kakaoId?: string | null
  instagramId?: string | null
  blogUrl?: string | null
  size?: 'sm' | 'md'
  emptyLabel?: string
}

const iconButtonClass =
  'inline-flex items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function SnsIconLinks({
  kakaoId,
  instagramId,
  blogUrl,
  size = 'md',
  emptyLabel = '등록된 SNS가 없습니다',
}: SnsIconLinksProps) {
  const [personalDialogOpen, setPersonalDialogOpen] = useState(false)
  const [personalId, setPersonalId] = useState('')

  const buttonSize = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  if (!hasAnySnsValue({ kakaoId, instagramId, blogUrl })) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>
  }

  function handleKakaoClick() {
    const kakao = resolveKakaoLink(kakaoId)
    if (kakao.kind === 'external' || kakao.kind === 'channel_friend') {
      window.open(kakao.href, '_blank', 'noopener,noreferrer')
      return
    }
    if (kakao.kind === 'personal_id') {
      setPersonalId(kakao.id)
      setPersonalDialogOpen(true)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasSnsLinkValue(kakaoId) ? (
          <button
            type="button"
            className={cn(iconButtonClass, buttonSize, 'bg-[#FEE500] hover:bg-[#FEE500]/90')}
            onClick={handleKakaoClick}
            title="카카오톡"
            aria-label="카카오톡"
          >
            <MessageCircle className={cn(iconSize, 'text-[#3C1E1E]')} />
          </button>
        ) : null}
        {hasSnsLinkValue(instagramId) ? (
          <a
            href={buildInstagramUrl(instagramId!.trim())}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(iconButtonClass, buttonSize)}
            title="인스타그램"
            aria-label="인스타그램"
          >
            <Instagram className={cn(iconSize, 'text-pink-600')} />
          </a>
        ) : null}
        {hasSnsLinkValue(blogUrl) ? (
          <a
            href={buildBlogUrl(blogUrl!.trim())}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(iconButtonClass, buttonSize)}
            title="블로그"
            aria-label="블로그"
          >
            <Globe className={cn(iconSize, 'text-primary')} />
          </a>
        ) : null}
      </div>
      <KakaoPersonalIdDialog
        id={personalId}
        open={personalDialogOpen}
        onOpenChange={setPersonalDialogOpen}
      />
    </>
  )
}
