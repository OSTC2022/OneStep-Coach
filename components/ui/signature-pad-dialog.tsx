'use client'

import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CheckCircle2, GripVertical, History, Lock, RotateCcw, Clock, Unlock } from 'lucide-react'
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
import {
  applyPanelResize,
  clampPanelPosition,
  getViewportShellBounds,
  PANEL_MIN_SIZES,
  prefsToPanelPixels,
  readSignatureCompletionShellPrefs,
  resetSignatureCompletionShellLayout,
  writeSignatureCompletionShellPrefs,
  type FloatingPanelRect,
  type PanelPixelRect,
  type ShellResizeEdge,
  type SignatureCompletionShellPrefs,
} from '@/lib/signature-completion-shell-prefs'

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
   * 있으면 남은횟차·서명 창을 각각 드래그해 배치합니다.
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

const RESIZE_EDGES: Array<{
  edge: ShellResizeEdge
  className: string
  cursor: string
}> = [
  { edge: 'n', className: 'left-3 right-3 top-0 h-2', cursor: 'ns-resize' },
  { edge: 's', className: 'left-3 right-3 bottom-0 h-2', cursor: 'ns-resize' },
  { edge: 'e', className: 'top-3 bottom-3 right-0 w-2', cursor: 'ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 left-0 w-2', cursor: 'ew-resize' },
  { edge: 'ne', className: 'right-0 top-0 h-4 w-4', cursor: 'nesw-resize' },
  { edge: 'nw', className: 'left-0 top-0 h-4 w-4', cursor: 'nwse-resize' },
  { edge: 'se', className: 'right-0 bottom-0 h-4 w-4', cursor: 'nwse-resize' },
  { edge: 'sw', className: 'left-0 bottom-0 h-4 w-4', cursor: 'nesw-resize' },
]

type PanelKey = 'insight' | 'signature'

function loadPanelPixels(prefs: SignatureCompletionShellPrefs): {
  insight: PanelPixelRect
  signature: PanelPixelRect
} {
  return {
    insight: prefsToPanelPixels(prefs.insight, PANEL_MIN_SIZES.insight),
    signature: prefsToPanelPixels(prefs.signature, PANEL_MIN_SIZES.signature),
  }
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
  const [shellPrefs, setShellPrefs] = useState<SignatureCompletionShellPrefs>(() =>
    readSignatureCompletionShellPrefs(),
  )
  const [panelRects, setPanelRects] = useState(() =>
    loadPanelPixels(readSignatureCompletionShellPrefs()),
  )
  const [activePanel, setActivePanel] = useState<PanelKey>('signature')
  const [isInteracting, setIsInteracting] = useState(false)
  const interactionRef = useRef<
    | {
        kind: 'drag' | 'resize'
        panel: PanelKey
        edge?: ShellResizeEdge
        startRect: PanelPixelRect
        clientX: number
        clientY: number
        offsetX: number
        offsetY: number
      }
    | null
  >(null)

  const splitLayout = Boolean(companion)
  const shellLocked = shellPrefs.locked

  const persistPanels = useCallback(
    (nextRects: { insight: PanelPixelRect; signature: PanelPixelRect }, locked: boolean) => {
      const { vw, vh, maxWidth, maxHeight } = getViewportShellBounds()
      const toRatio = (p: PanelPixelRect): FloatingPanelRect => ({
        leftRatio: p.left / Math.max(1, vw),
        topRatio: p.top / Math.max(1, vh),
        widthRatio: p.width / Math.max(1, maxWidth),
        heightRatio: p.height / Math.max(1, maxHeight),
      })
      const nextPrefs: SignatureCompletionShellPrefs = {
        locked,
        insight: toRatio(nextRects.insight),
        signature: toRatio(nextRects.signature),
      }
      setShellPrefs(nextPrefs)
      writeSignatureCompletionShellPrefs(nextPrefs)
    },
    [],
  )

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = Math.max(1, container.clientWidth)
    const height = Math.max(
      120,
      container.clientHeight > 0
        ? container.clientHeight
        : touchFriendly
          ? Math.round(width * 0.42)
          : Math.round(width * 0.4),
    )
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

    const prefs = readSignatureCompletionShellPrefs()
    setShellPrefs(prefs)
    setPanelRects(loadPanelPixels(prefs))
    setEndTime(defaultEndTime)

    const timer = window.setTimeout(initCanvas, 50)
    const onResize = () => {
      const next = loadPanelPixels(readSignatureCompletionShellPrefs())
      setPanelRects(next)
      initCanvas()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [open, initCanvas, defaultEndTime])

  useEffect(() => {
    if (!open || !splitLayout) return
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      initCanvas()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [
    open,
    splitLayout,
    panelRects.signature.width,
    panelRects.signature.height,
    initCanvas,
  ])

  useEffect(() => {
    if (!isInteracting) return

    function onMove(e: PointerEvent) {
      const session = interactionRef.current
      if (!session) return
      e.preventDefault()

      if (session.kind === 'drag') {
        const pos = clampPanelPosition(
          e.clientX - session.offsetX,
          e.clientY - session.offsetY,
          session.startRect.width,
          session.startRect.height,
        )
        setPanelRects((prev) => ({
          ...prev,
          [session.panel]: {
            ...session.startRect,
            left: pos.left,
            top: pos.top,
          },
        }))
        return
      }

      if (session.kind === 'resize' && session.edge) {
        const next = applyPanelResize(
          session.edge,
          {
            ...session.startRect,
            clientX: session.clientX,
            clientY: session.clientY,
          },
          e.clientX,
          e.clientY,
          PANEL_MIN_SIZES[session.panel],
        )
        setPanelRects((prev) => ({
          ...prev,
          [session.panel]: next,
        }))
      }
    }

    function onUp() {
      const session = interactionRef.current
      if (!session) return
      interactionRef.current = null
      setIsInteracting(false)
      setPanelRects((current) => {
        persistPanels(current, shellPrefs.locked)
        return current
      })
    }

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [isInteracting, persistPanels, shellPrefs.locked])

  function startPanelDrag(panel: PanelKey, e: React.PointerEvent) {
    if (shellLocked || isSubmitting) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, select, canvas, [data-no-drag]')) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const rect = panelRects[panel]
    setActivePanel(panel)
    interactionRef.current = {
      kind: 'drag',
      panel,
      startRect: rect,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }
    setIsInteracting(true)
  }

  function startPanelResize(
    panel: PanelKey,
    edge: ShellResizeEdge,
    e: React.PointerEvent<HTMLDivElement>,
  ) {
    if (shellLocked || isSubmitting) return
    e.preventDefault()
    e.stopPropagation()
    setActivePanel(panel)
    interactionRef.current = {
      kind: 'resize',
      panel,
      edge,
      startRect: panelRects[panel],
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: 0,
      offsetY: 0,
    }
    setIsInteracting(true)
  }

  function toggleShellLock() {
    setShellPrefs((prev) => {
      const next = { ...prev, locked: !prev.locked }
      writeSignatureCompletionShellPrefs(next)
      return next
    })
  }

  function handleResetLayout() {
    const next = resetSignatureCompletionShellLayout()
    setShellPrefs(next)
    setPanelRects(loadPanelPixels(next))
  }

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
        <div className="shrink-0 space-y-1.5">
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

      <div
        ref={containerRef}
        className="relative min-h-[7.5rem] flex-1 overflow-hidden rounded-lg border border-border"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="relative z-0 block h-full w-full touch-none cursor-crosshair"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none text-4xl font-semibold tracking-[0.2em] text-white/10 sm:text-5xl"
        >
          서명
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={clearSignature}
        className="w-full shrink-0"
      >
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

  function renderFloatingWindow(
    panel: PanelKey,
    titleText: string,
    body: ReactNode,
    hint: string,
  ) {
    const rect = panelRects[panel]
    const z = activePanel === panel ? 40 : 30
    return (
      <div
        className={cn(
          'absolute flex flex-col overflow-hidden rounded-2xl border border-primary/35 bg-background shadow-2xl',
          isInteracting && activePanel === panel && 'select-none',
        )}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          zIndex: z,
        }}
        onPointerDown={() => setActivePanel(panel)}
      >
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b border-border/70 px-2 py-1.5',
            shellLocked
              ? 'cursor-default'
              : 'cursor-grab touch-none active:cursor-grabbing',
          )}
          onPointerDown={(e) => startPanelDrag(panel, e)}
        >
          {!shellLocked ? (
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{titleText}</p>
            <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>

        {!shellLocked
          ? RESIZE_EDGES.map(({ edge, className, cursor }) => (
              <div
                key={`${panel}-${edge}`}
                role="separator"
                aria-label={`${titleText} 크기 조절 ${edge}`}
                className={cn('absolute z-20 touch-none', className)}
                style={{ cursor }}
                onPointerDown={(e) => startPanelResize(panel, edge, e)}
              />
            ))
          : null}
      </div>
    )
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
          mobileSheet={!splitLayout}
          opaqueBackdrop
          showCloseButton={!splitLayout}
          style={splitLayout ? SPLIT_SHELL_STYLE : undefined}
          className={cn(
            splitLayout
              ? cn(
                  '!inset-0 !top-0 !left-0 !right-0 !bottom-0 !z-50',
                  '!flex !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none',
                  '!translate-x-0 !translate-y-0 !items-stretch !justify-stretch !gap-0 !rounded-none !border-0',
                  '!bg-transparent !p-0',
                  '!shadow-none',
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
            <div className="relative h-full w-full">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[50] flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]">
                <div
                  data-no-drag
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-2 py-1 shadow-lg backdrop-blur"
                >
                  <p className="hidden px-1 text-[10px] text-muted-foreground sm:block">
                    {shellLocked
                      ? '위치·크기 잠금'
                      : '창 상단을 누른 채 원하는 위치로 이동'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={shellLocked ? 'default' : 'outline'}
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={toggleShellLock}
                    disabled={isSubmitting}
                    title={shellLocked ? '잠금 해제' : '위치·크기 잠금'}
                  >
                    {shellLocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                    {shellLocked ? '잠금 중' : '잠금'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isSubmitting || shellLocked}
                    onClick={handleResetLayout}
                  >
                    배치 초기화
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isSubmitting}
                    onClick={() => onOpenChange(false)}
                  >
                    닫기
                  </Button>
                </div>
              </div>

              {!successSummary && companion
                ? renderFloatingWindow(
                    'insight',
                    '남은 횟차 · 신체정보',
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
                      {companion}
                    </div>,
                    shellLocked ? '잠금됨' : '상단을 드래그해 이동',
                  )
                : null}

              {renderFloatingWindow(
                'signature',
                title,
                <>
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

                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-2 sm:px-5">
                    {signatureBody}
                  </div>
                  {footer}
                </>,
                shellLocked ? '잠금됨' : '상단을 드래그해 이동',
              )}
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
