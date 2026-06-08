'use client'

import { useState } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildBlogUrl,
  buildInstagramUrl,
  hasSnsLinkValue,
  resolveKakaoLink,
} from '@/lib/sns-links'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SnsIdLinkProps {
  value: string | null | undefined
  type: 'kakao' | 'instagram' | 'blog'
  className?: string
}

const linkClassName =
  'text-right text-primary break-all hover:underline cursor-pointer'

export function KakaoPersonalIdDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  async function handleCopy() {
    await navigator.clipboard.writeText(id)
    toast.success('아이디가 복사되었습니다.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            카카오톡 친구 추가
          </DialogTitle>
          <DialogDescription>
            개인 아이디는 카카오톡 앱에서 ID 검색으로 추가합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">카카오톡 ID</p>
            <p className="mt-1 text-lg font-semibold tracking-wide">{id}</p>
          </div>
          <Button type="button" className="w-full min-h-11" onClick={() => void handleCopy()}>
            <Copy className="mr-2 h-4 w-4" />
            아이디 복사
          </Button>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. 카카오톡 → 친구 → 친구 추가</li>
            <li>2. ID로 추가 선택</li>
            <li>3. 복사한 아이디 붙여넣기 → 추가</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SnsIdLink({ value, type, className }: SnsIdLinkProps) {
  const [personalDialogOpen, setPersonalDialogOpen] = useState(false)
  const [personalId, setPersonalId] = useState('')

  if (!hasSnsLinkValue(value)) {
    return <span className={cn('text-right', className)}>-</span>
  }

  const trimmed = value!.trim()

  if (type === 'instagram') {
    return (
      <a
        href={buildInstagramUrl(trimmed)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClassName, className)}
      >
        {trimmed}
      </a>
    )
  }

  if (type === 'blog') {
    return (
      <a
        href={buildBlogUrl(trimmed)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClassName, className)}
      >
        {trimmed}
      </a>
    )
  }

  const kakao = resolveKakaoLink(trimmed)

  if (kakao.kind === 'external' || kakao.kind === 'channel_friend') {
    return (
      <a
        href={kakao.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClassName, className)}
        title={kakao.kind === 'channel_friend' ? '카카오톡 채널 친구 추가' : undefined}
      >
        {trimmed}
      </a>
    )
  }

  if (kakao.kind === 'personal_id') {
    return (
      <>
        <button
          type="button"
          className={cn(linkClassName, 'bg-transparent border-0 p-0 font-inherit', className)}
          onClick={() => {
            setPersonalId(kakao.id)
            setPersonalDialogOpen(true)
          }}
          title="클릭하면 친구 추가 방법을 안내합니다"
        >
          {trimmed}
        </button>
        <KakaoPersonalIdDialog
          id={personalId || kakao.id}
          open={personalDialogOpen}
          onOpenChange={setPersonalDialogOpen}
        />
      </>
    )
  }

  return <span className={cn('text-right', className)}>-</span>
}
