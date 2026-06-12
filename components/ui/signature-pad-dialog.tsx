'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { History, RotateCcw, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TimeInput24 } from '@/components/ui/time-input-24'
import { cn } from '@/lib/utils'
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
  onConfirm: (signatureData: string, endTime?: string) => void
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
  onConfirm,
}: SignaturePadDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [pastLessonOpen, setPastLessonOpen] = useState(false)
  const [endTime, setEndTime] = useState(defaultEndTime)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    const height = Math.max(280, Math.min(360, Math.round(width * 0.45)))
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
  }, [])

  useEffect(() => {
    if (!open) {
      setSignatureData(null)
      setIsDrawing(false)
      setPastLessonOpen(false)
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

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault()
    if (!isDrawing) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL())
    }
  }

  const clearSignature = () => {
    initCanvas()
  }

  const handleConfirm = () => {
    if (!signatureData) return
    if (showEndTime && !endTime.trim()) return
    onConfirm(signatureData, showEndTime ? endTime : undefined)
  }

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
        className="max-w-3xl gap-4"
        onPointerDownOutside={(e) => {
          if (isSubmitting) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting) e.preventDefault()
        }}
      >
        <DialogHeader>
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
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums',
                )}
              >
                <Clock className="h-4 w-4 shrink-0 opacity-60" />
                {endTime || '—'}
              </div>
            )}
          </div>
        ) : null}

        <div ref={containerRef} className="overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="block w-full touch-none cursor-crosshair"
          />
        </div>

        <Button type="button" variant="outline" onClick={clearSignature} className="w-full">
          <RotateCcw className="mr-2 h-4 w-4" />
          다시 서명
        </Button>

        <DialogFooter
          className={
            showPastLessonFinder ? 'gap-2 sm:justify-between' : 'gap-2 sm:justify-end'
          }
        >
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
              onClick={handleConfirm}
              disabled={isSubmitting || !signatureData || (showEndTime && !endTime.trim())}
            >
              {isSubmitting ? '저장 중...' : confirmLabel}
            </Button>
          </div>
        </DialogFooter>
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
