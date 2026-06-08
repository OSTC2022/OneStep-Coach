'use client'

import Image from 'next/image'
import { Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  hasKakaoChannelLink,
  KAKAO_CHANNEL_DEFAULT_ID,
  KAKAO_CHANNEL_QR_SRC,
  openKakaoChannel,
} from '@/lib/center-contact'

interface KakaoChannelInquiryDialogProps {
  channelId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  qrSrc?: string
}

export function KakaoChannelInquiryDialog({
  channelId,
  open,
  onOpenChange,
  qrSrc = KAKAO_CHANNEL_QR_SRC,
}: KakaoChannelInquiryDialogProps) {
  const displayId = channelId.trim() || KAKAO_CHANNEL_DEFAULT_ID
  const canOpenChannel = hasKakaoChannelLink(displayId)

  async function handleCopy() {
    await navigator.clipboard.writeText(displayId)
    toast.success('채널 아이디가 복사되었습니다.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            카카오톡 문의
          </DialogTitle>
          <DialogDescription>
            QR 스캔 또는 채널 검색으로 원스텝에 문의해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mx-auto w-fit rounded-xl border border-border bg-white p-3">
            <Image
              src={qrSrc}
              alt="원스텝 카카오톡 채널 QR 코드"
              width={180}
              height={180}
              className="h-44 w-44 object-contain"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">채널 검색 아이디</p>
            <p className="mt-1 text-lg font-semibold tracking-wide">{displayId}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void handleCopy()}
            >
              <Copy className="mr-2 h-4 w-4" />
              아이디 복사
            </Button>
            {canOpenChannel ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => openKakaoChannel(displayId)}
              >
                채널 바로가기
              </Button>
            ) : null}
          </div>

          <ol className="space-y-1.5 text-sm text-muted-foreground">
            <li>1. 카카오톡 → 채널 → 채널 검색</li>
            <li>2. 아이디 입력 또는 QR 스캔</li>
            <li>3. 채널 추가 후 문의 남기기</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}
