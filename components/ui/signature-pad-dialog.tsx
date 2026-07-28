'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckCircle2, History, RotateCcw, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TimeInput24 } from '@/components/ui/time-input-24'
import { cn } from '@/lib/utils'
import { useTouchFriendlyLayout } from '@/hooks/use-touch-friendly-layout'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PastLessonSignatureDialog = dynamic(
  () =>
    import('@/components/lesson-status/past-lesson-signature-dialog').then((m) => ({
      default: m.PastLessonSignatureDialog,
    })),
  { ssr: false },
)

export type SignaturePadSuccessSummary = {
  remainingLabel?: string | null
}

interface SignaturePadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  memberLabel?: string
  confirmLabel?: string
  isSubmitting?: boolean
  showPastLessonFinder?: boolean
  pastLessonMemberId?: string | null
  onPastLessonUpdated?: (
    lessonId: string,
    patch: {
      signature_id?: string | null
      end_time?: string | null
      session_deducted?: boolean
      attendance_status?: string
    },
  ) => void
  /** 관리자 — 종료 시간 직접 입력 */
  canEditEndTime?: boolean
  /** 수업 종료 시 종료 시간 표시 (비관리자는 읽기 전용) */
  showEndTime?: boolean
  defaultEndTime?: string
  /** 서명 확정 직전 — false면 중단 (별도 회원정보 패널 저장 등) */
  onBeforeConfirm?: () => Promise<boolean>
  /**
   * 상단 동반 패널(회원 신체정보 등).
   * 있으면 전체 화면을 위(정보)·아래(서명)로 나눠 겹치지 않게 배치합니다.
   */
  companion?: ReactNode
  onConfirm: (
    signatureData: string,
    endTime?: string,
  ) =>
    | void
    | SignaturePadSuccessSummary
    | Promise<void | SignaturePadSuccessSummary | null | false>
    | null
    | false
}

const SPLIT_SHELL_STYLE: CSSProperties = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  transform: 'none',
  width: '100vw',
  maxWidth: '100vw',
  height: '100dvh',
  maxHeight: '100dvh',
}

export function SignaturePadDialog({
  open,
  onOpenChange,
  title = '서명',
  description = '아래에 서명해주세요.',
  memberLabel,
  confirmLabel = '확인',
  isSubmitting = false,
  showPastLessonFinder = false,
  pastLessonMemberId,
  onPastLessonUpdated,
  canEditEndTime = false,
  showEndTime = false,
  defaultEndTime = '',
  onBeforeConfirm,
  companion,
  onConfirm,
}: SignaturePadDialogProps) {
  const touchFriendly = useTouchFriendlyLayout()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [pastLessonOpen, setPastLessonOpen] = useState(false)
  const [endTime, setEndTime] = useState(defaultEndTime)
  const [successSummary, setSuccessSummary] = useState<SignaturePadSuccessSummary | null>(
    null,
  )

  const splitLayout = Boolean(companion)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    // 가로는 중간, 세로는 서명하기 편하게
    const height = touchFriendly
      ? Math.max(170, Math.min(220, Math.round(width * 0.42)))
      : Math.max(200, Math.min(260, Math.round(width * 0.4)))
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#1B2838'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#AAFF00'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setSignatureData(null)
  }, [touchFriendly])

  useEffect(() => {
    if (!open) {
      setSignatureData(null)
      setIsDrawing(false)
      setPastLessonOpen(false)
      setSuccessSummary(null)
      return
    }

    setEndTime(defaultEndTime)

    const timer = window.setTimeout(initCanvas, 50)
    const onResize = () => initCanvas()
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [open, initCanvas, defaultEndTime])

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL())
    }
  }

  const clearSignature = () => {
    initCanvas()
  }

  const handleConfirm = async () => {
    if (!signatureData) return
    if (showEndTime && !endTime.trim()) return

    if (onBeforeConfirm) {
      const ok = await onBeforeConfirm()
      if (!ok) return
    }

    const result = await onConfirm(signatureData, showEndTime ? endTime : undefined)
    if (result === null || result === false) return
    if (result && typeof result === 'object') {
      setSuccessSummary(result)
      return
    }
    onOpenChange(false)
  }

  const signatureBody = successSummary ? (
    <div className="flex flex-col items-center gap-3 py-10 text-center sm:py-12">
      <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />
      <p className="text-2xl font-semibold tracking-tight text-foreground">감사합니다</p>
      {successSummary.remainingLabel ? (
        <p className="text-base font-medium text-primary tabular-nums">
          {successSummary.remainingLabel}
        </p>
      ) : null}
      <p className="max-w-xs text-sm text-muted-foreground">수업이 종료되었습니다.</p>
    </div>
  ) : (
    <>
      {showEndTime ? (
        <div className="space-y-1.5">
          <Label htmlFor="lesson-end-time">종료 시간</Label>
          {canEditEndTime ? (
            <TimeInput24
              id="lesson-end-time"
              value={endTime}
              onChange={setEndTime}
            />
          ) : (
            <div
              id="lesson-end-time"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums"
            >
              <Clock className="h-4 w-4 shrink-0 opacity-60" />
              {endTime || '—'}
            </div>
          )}
        </div>
      ) : null}

      <div ref={containerRef} className="relative overflow-hidden rounded-lg border border-border">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="relative z-0 block w-full touch-none cursor-crosshair"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none text-4xl font-semibold tracking-[0.2em] text-white/10 sm:text-5xl"
        >
          서명
        </span>
      </div>

      <Button type="button" variant="outline" onClick={clearSignature} className="w-full">
        <RotateCcw className="mr-2 h-4 w-4" />
        다시 서명
      </Button>
    </>
  )

  const footer = (
    <DialogFooter
      className={cn(
        'shrink-0 border-t border-border px-4 py-3 sm:px-6',
        showPastLessonFinder && !successSummary
          ? 'gap-2 sm:justify-between'
          : 'gap-2 sm:justify-end',
      )}
    >
      {successSummary ? (
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            setSuccessSummary(null)
            onOpenChange(false)
          }}
        >
          확인
        </Button>
      ) : (
        <>
          {showPastLessonFinder ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setPastLessonOpen(true)}
            >
              <History className="mr-2 h-4 w-4" />
              지난 수업 찾기
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSubmitting || !signatureData || (showEndTime && !endTime.trim())}
            >
              {isSubmitting ? '저장 중...' : confirmLabel}
            </Button>
          </div>
        </>
      )}
    </DialogFooter>
  )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isSubmitting) return
          onOpenChange(next)
        }}
      >
        <DialogContent
          mobileSheet={!splitLayout}
          opaqueBackdrop
          showCloseButton
          style={splitLayout ? SPLIT_SHELL_STYLE : undefined}
          className={cn(
            splitLayout
              ? cn(
                  // 전체 화면 셸 — 중앙 모달/시트 위치 클래스 전부 무력화
                  '!inset-0 !top-0 !left-0 !right-0 !bottom-0 !z-50',
                  '!flex !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none',
                  '!translate-x-0 !translate-y-0 !gap-3 !rounded-none !border-0',
                  '!bg-transparent !p-2 !pt-[max(0.5rem,env(safe-area-inset-top))]',
                  '!pb-[max(0.5rem,env(safe-area-inset-bottom))] !shadow-none',
                  'sm:!p-3 sm:!pt-[max(0.75rem,env(safe-area-inset-top))]',
                )
              : cn(
                  'max-w-3xl gap-0 overflow-hidden border-primary/20 p-0',
                  touchFriendly && 'max-lg:flex max-lg:max-h-[inherit] max-lg:flex-col',
                ),
          )}
          onPointerDownOutside={(e) => {
            if (isSubmitting) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (isSubmitting) e.preventDefault()
          }}
        >
          {splitLayout ? (
            <div
              className={cn(
                'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-2',
                // 모바일·태블릿: 위(그래프) / 아래(서명 하단 고정)
                // PC: 좌·우
                'lg:max-w-7xl lg:flex-row lg:items-stretch lg:gap-4',
              )}
            >
              {!successSummary && companion ? (
                <div
                  className={cn(
                    'flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background shadow-2xl',
                    // 서명란을 제외한 나머지(절반 이상)를 그래프로 사용
                    'min-h-0 flex-1 basis-0',
                    'lg:min-h-0 lg:min-w-0 lg:flex-[1.35]',
                  )}
                >
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                    {companion}
                  </div>
                </div>
              ) : null}

              <div
                className={cn(
                  'mx-auto flex w-full shrink-0 flex-col overflow-hidden',
                  'rounded-2xl border border-primary/20 bg-background shadow-2xl',
                  // 가로는 적당히, 세로는 서명 여유 있게
                  'mt-auto max-w-md max-h-[min(52dvh,520px)]',
                  'sm:max-w-lg',
                  'lg:mx-0 lg:mt-0 lg:max-h-none lg:w-[min(100%,24rem)] lg:max-w-sm lg:flex-none lg:self-stretch',
                )}
              >
                <DialogHeader
                  className={cn(
                    'shrink-0 space-y-0.5 border-b border-primary/10 bg-primary/[0.03] text-left',
                    'px-4 py-2 sm:px-5',
                  )}
                >
                  <DialogTitle className="text-base leading-snug">{title}</DialogTitle>
                  <DialogDescription className="text-xs leading-snug sm:text-sm">
                    {memberLabel ? (
                      <>
                        <span className="font-medium text-foreground">{memberLabel}</span>
                        <span className="mx-1">·</span>
                      </>
                    ) : null}
                    {description}
                  </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-2 sm:px-5">
                  {signatureBody}
                </div>
                {footer}
              </div>
            </div>
          ) : (
            <>
              <DialogHeader className="shrink-0 space-y-1 border-b border-primary/10 bg-primary/[0.03] px-4 pt-4 pb-3 text-left sm:px-6 sm:pt-5">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                  {memberLabel ? (
                    <>
                      <span className="font-medium text-foreground">{memberLabel}</span>
                      <span className="mx-1">·</span>
                    </>
                  ) : null}
                  {description}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-2 pb-2 sm:px-6">
                {signatureBody}
              </div>
              {footer}
            </>
          )}
        </DialogContent>
      </Dialog>

      {showPastLessonFinder ? (
        <PastLessonSignatureDialog
          open={pastLessonOpen}
          onOpenChange={setPastLessonOpen}
          memberId={pastLessonMemberId}
          memberLabel={memberLabel}
          onLessonUpdated={onPastLessonUpdated}
        />
      ) : null}
    </>
  )
}
