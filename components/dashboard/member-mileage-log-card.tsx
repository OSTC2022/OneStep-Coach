'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ImagePlus, Loader2, Pencil, Route, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteMemberMileageLog,
  saveMemberMileageLogForm,
  updateMemberMileageLogForm,
} from '@/lib/actions/running-league'
import { analyzeRunningScreenshotFile } from '@/lib/running-league/analyze-running-screenshot-client'
import { preloadScreenshotOcrWorker } from '@/lib/running-league/screenshot-ocr-client'
import { formatDistanceKmInput } from '@/lib/running-analysis/normalize'
import {
  hasMinimumScreenshotExtraction,
  resolveScreenshotAnalysisUi,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  screenshotApiErrorMessage,
} from '@/lib/running-league/screenshot-analysis-errors'
import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'
import { MILEAGE_SCORE_CAP_KM, mileageScoreFromKm } from '@/lib/running-league/scoring'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type MemberMileageLogCardProps = {
  participant: RunningLeagueParticipant | null
  mileageLogs: RunningLeagueMileageLog[]
  tableReady: boolean
  variant?: 'card' | 'embedded'
}

type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'partial' | 'failed'

type FieldHint = 'filled' | 'review' | 'missing' | 'neutral'

type ExtractionFieldHints = {
  distanceKm: FieldHint
  duration: FieldHint
  pace: FieldHint
  heartRate: FieldHint
  calories: FieldHint
  loggedAt: FieldHint
  activityTime: FieldHint
}

const EMPTY_FIELD_HINTS: ExtractionFieldHints = {
  distanceKm: 'neutral',
  duration: 'neutral',
  pace: 'neutral',
  heartRate: 'neutral',
  calories: 'neutral',
  loggedAt: 'neutral',
  activityTime: 'neutral',
}

type MileageFormState = {
  distanceKm: string
  duration: string
  pace: string
  loggedAt: string
  activityTime: string
  heartRate: string
  calories: string
  sourceApp: string
  imageHash: string
  extractionConfidence: number | null
  extractionRawJson: Record<string, unknown> | null
}

function initialFormState(): MileageFormState {
  return {
    distanceKm: '',
    duration: '',
    pace: '',
    loggedAt: new Date().toISOString().slice(0, 10),
    activityTime: '',
    heartRate: '',
    calories: '',
    sourceApp: '',
    imageHash: '',
    extractionConfidence: null,
    extractionRawJson: null,
  }
}

function formatLogDate(value: string): string {
  try {
    return format(parseISO(value), 'M월 d일 (EEE)', { locale: ko })
  } catch {
    return value
  }
}

function formatLogDateTime(value: string): string {
  try {
    return format(parseISO(value), 'yyyy.M.d (EEE) HH:mm', { locale: ko })
  } catch {
    return value
  }
}

function formatLogShortDate(value: string): string {
  try {
    return format(parseISO(value), 'M/d', { locale: ko })
  } catch {
    return value
  }
}

function mileageSourceLabel(source: RunningLeagueMileageLog['source']): string {
  switch (source) {
    case 'import':
      return '스크린샷'
    case 'lesson':
      return '수업'
    case 'other':
      return '기타'
    default:
      return '직접 입력'
  }
}

function buildFieldHints(extraction: RunningScreenshotExtraction): ExtractionFieldHints {
  return {
    distanceKm: extraction.distance_km != null ? 'filled' : 'missing',
    duration: extraction.duration ? 'filled' : 'missing',
    pace: extraction.pace ? 'filled' : 'missing',
    heartRate: extraction.heart_rate != null ? 'filled' : 'missing',
    calories: extraction.calories != null ? 'filled' : 'missing',
    loggedAt: extraction.date_needs_review
      ? 'review'
      : extraction.activity_date
        ? 'filled'
        : 'missing',
    activityTime: extraction.activity_time ? 'filled' : 'missing',
  }
}

function fieldInputClass(hint: FieldHint) {
  return cn(
    'h-9',
    hint === 'filled' && 'border-emerald-500/40 bg-emerald-500/5',
    hint === 'review' && 'border-amber-400/50 bg-amber-400/5',
    hint === 'missing' && 'border-amber-400/30 bg-amber-400/5',
  )
}

function fieldLabelClass(hint: FieldHint) {
  return cn(
    'text-[11px]',
    hint === 'filled' && 'text-emerald-400',
    hint === 'review' && 'text-amber-300',
    hint === 'missing' && 'text-amber-300/80',
    hint === 'neutral' && 'text-muted-foreground',
  )
}

function resolveAnalysisUi(
  extraction: RunningScreenshotExtraction,
): { status: AnalysisStatus; message: string } {
  const ui = resolveScreenshotAnalysisUi(extraction)
  return {
    status: ui.status,
    message: ui.message,
  }
}

function applyExtractionToForm(
  extraction: RunningScreenshotExtraction,
  current: MileageFormState,
): MileageFormState {
  return {
    ...current,
    distanceKm:
      extraction.distance_km != null
        ? formatDistanceKmInput(extraction.distance_km)
        : current.distanceKm,
    duration: extraction.duration ?? current.duration,
    pace: extraction.pace ?? current.pace,
    loggedAt: extraction.activity_date ?? current.loggedAt,
    activityTime: extraction.activity_time ?? current.activityTime,
    heartRate: extraction.heart_rate != null ? String(extraction.heart_rate) : current.heartRate,
    calories: extraction.calories != null ? String(extraction.calories) : current.calories,
    sourceApp: extraction.source_app ?? current.sourceApp,
    extractionConfidence: extraction.confidence,
    extractionRawJson: extraction.raw_json ?? {
      method: extraction.extraction_method,
      missing_fields: extraction.missing_fields,
    },
  }
}

function logToForm(log: RunningLeagueMileageLog): MileageFormState {
  return {
    distanceKm: String(log.distance_km),
    duration: log.duration ?? '',
    pace: log.pace ?? '',
    loggedAt: log.logged_at,
    activityTime: log.activity_time ?? '',
    heartRate: log.heart_rate != null ? String(log.heart_rate) : '',
    calories: log.calories != null ? String(log.calories) : '',
    sourceApp: log.source_app ?? '',
    imageHash: log.image_hash ?? '',
    extractionConfidence: log.extraction_confidence ?? null,
    extractionRawJson: log.extraction_raw_json ?? null,
  }
}

function MileageLogList({
  logs,
  selectedLogId,
  editingLogId,
  onSelect,
  onEdit,
  onDelete,
  deleting,
}: {
  logs: RunningLeagueMileageLog[]
  selectedLogId: string | null
  editingLogId: string | null
  onSelect: (id: string) => void
  onEdit: (log: RunningLeagueMileageLog) => void
  onDelete: (log: RunningLeagueMileageLog) => void
  deleting?: boolean
}) {
  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
        이번 달 등록된 기록이 없습니다.
      </p>
    )
  }

  return (
    <ul className="max-h-44 space-y-1 overflow-y-auto">
      {logs.map((log) => {
        const selected = selectedLogId === log.id
        const editing = editingLogId === log.id
        return (
          <li key={log.id}>
            <div
              className={cn(
                'flex items-center gap-1 rounded-lg border px-1 py-1 transition-colors',
                selected || editing
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/60 bg-background/40',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(log.id)}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/30"
              >
                <span className="block font-medium text-foreground">
                  {formatLogShortDate(log.logged_at)} · {Number(log.distance_km).toFixed(1)}km
                  {log.duration ? ` · ${log.duration}` : ''}
                </span>
                <span className="text-[10px] text-muted-foreground">{mileageSourceLabel(log.source)}</span>
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => onEdit(log)}
                aria-label="기록 수정"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => onDelete(log)}
                disabled={deleting}
                aria-label="기록 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selected ? (
              <div className="mt-1 space-y-0.5 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                <p>
                  <span className="text-foreground/80">기록 날짜</span> {formatLogDate(log.logged_at)}
                </p>
                {log.activity_time ? (
                  <p>
                    <span className="text-foreground/80">운동 시간</span> {log.activity_time}
                  </p>
                ) : null}
                <p>
                  <span className="text-foreground/80">등록 시간</span> {formatLogDateTime(log.created_at)}
                </p>
                {log.duration ? (
                  <p>
                    <span className="text-foreground/80">총 시간</span> {log.duration}
                  </p>
                ) : null}
                {log.pace ? (
                  <p>
                    <span className="text-foreground/80">페이스</span> {log.pace}/km
                  </p>
                ) : null}
                {log.notes.trim() ? <p className="truncate">메모: {log.notes}</p> : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function AnalysisSummary({
  form,
  fieldHints,
}: {
  form: MileageFormState
  fieldHints: ExtractionFieldHints
}) {
  if (!form.distanceKm && !form.duration && !form.pace) return null

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs">
      <p className="font-medium text-emerald-400">인식된 기록</p>
      <div className="mt-1.5 space-y-0.5 text-muted-foreground">
        {form.distanceKm ? <p className={fieldHints.distanceKm === 'filled' ? 'text-emerald-300' : ''}>거리: {form.distanceKm}km</p> : null}
        {form.duration ? <p className={fieldHints.duration === 'filled' ? 'text-emerald-300' : ''}>총 시간: {form.duration}</p> : null}
        {form.pace ? <p className={fieldHints.pace === 'filled' ? 'text-emerald-300' : ''}>페이스: {form.pace}/km</p> : null}
        {form.loggedAt ? (
          <p className={fieldHints.loggedAt === 'review' ? 'text-amber-300' : fieldHints.loggedAt === 'filled' ? 'text-emerald-300' : ''}>
            날짜: {formatLogDate(form.loggedAt)}
            {fieldHints.loggedAt === 'review' ? ' (확인 필요)' : ''}
          </p>
        ) : null}
        {form.activityTime ? <p className={fieldHints.activityTime === 'filled' ? 'text-emerald-300' : ''}>운동 시각: {form.activityTime}</p> : null}
      </div>
    </div>
  )
}

export function MemberMileageLogCard({
  participant,
  mileageLogs,
  tableReady,
  variant = 'card',
}: MemberMileageLogCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [form, setForm] = useState<MileageFormState>(initialFormState)
  const [saving, setSaving] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle')
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null)
  const [fieldHints, setFieldHints] = useState<ExtractionFieldHints>(EMPTY_FIELD_HINTS)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RunningLeagueMileageLog | null>(null)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotFileRef = useRef<File | null>(null)

  const mileageKm = participant?.mileage_km ?? 0
  const mileageScore = participant?.mileage_score ?? mileageScoreFromKm(mileageKm)

  useEffect(() => {
    preloadScreenshotOcrWorker()
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const resetForm = () => {
    setForm(initialFormState())
    setEditingLogId(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    screenshotFileRef.current = null
    setAnalysisStatus('idle')
    setAnalysisMessage(null)
    setFieldHints(EMPTY_FIELD_HINTS)
  }

  const updateForm = (patch: Partial<MileageFormState>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const buildSavePayload = (skipDuplicateCheck = false) => ({
    distance_km: Number(form.distanceKm),
    logged_at: form.loggedAt,
    duration: form.duration || null,
    pace: form.pace || null,
    heart_rate: form.heartRate ? Number(form.heartRate) : null,
    calories: form.calories ? Number(form.calories) : null,
    activity_time: form.activityTime || null,
    source_app: form.sourceApp || null,
    image_hash: form.imageHash || null,
    extraction_confidence: form.extractionConfidence,
    extraction_raw_json: form.extractionRawJson,
    verification_status: screenshotFileRef.current ? 'confirmed' as const : 'manual' as const,
    source: screenshotFileRef.current ? ('import' as const) : ('manual' as const),
    notes: screenshotFileRef.current ? '러닝 앱 스크린샷 인식' : '',
    skip_duplicate_check: skipDuplicateCheck,
  })

  const submitSave = async (skipDuplicateCheck = false) => {
    const parsedDistance = Number(form.distanceKm)
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
      toast.error('거리(km)를 입력해주세요.')
      return
    }

    setSaving(true)
    const formData = new FormData()
    formData.append('payload', JSON.stringify(buildSavePayload(skipDuplicateCheck)))

    const result = editingLogId
      ? await updateMemberMileageLogForm(editingLogId, formData)
      : await (async () => {
          if (screenshotFileRef.current) {
            formData.append('screenshot', screenshotFileRef.current, screenshotFileRef.current.name)
          }
          return saveMemberMileageLogForm(formData)
        })()
    setSaving(false)

    if (!result.ok) {
      if (result.duplicate) {
        setDuplicateOpen(true)
        return
      }
      toast.error(result.error)
      return
    }

    toast.success(editingLogId ? '기록이 수정되었습니다.' : `${parsedDistance}km 기록이 저장되었습니다.`)
    router.refresh()
    setOpen(false)
    resetForm()
  }

  const handleEditLog = (log: RunningLeagueMileageLog) => {
    setEditingLogId(log.id)
    setForm(logToForm(log))
    setOpen(true)
    setSelectedLogId(log.id)
    setAnalysisStatus('idle')
    setAnalysisMessage('기록을 수정한 뒤 저장해주세요.')
    screenshotFileRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  const handleDeleteLog = (log: RunningLeagueMileageLog) => {
    setDeleteTarget(log)
    setDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteMemberMileageLog(deleteTarget.id)
    setDeleting(false)
    setDeleteOpen(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('기록이 삭제되었습니다.')
    if (editingLogId === deleteTarget.id) {
      resetForm()
      setOpen(false)
    }
    setDeleteTarget(null)
    setSelectedLogId(null)
    router.refresh()
  }

  const handleScreenshotChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 첨부할 수 있습니다.')
      return
    }

    screenshotFileRef.current = file
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setOpen(true)
    setEditingLogId(null)
    setAnalysisStatus('analyzing')
    setAnalysisMessage(null)
    setFieldHints(EMPTY_FIELD_HINTS)

    try {
      const result = await analyzeRunningScreenshotFile(file)
      if (!result.ok) {
        setAnalysisStatus('failed')
        setAnalysisMessage(result.message || result.error)
        setFieldHints(EMPTY_FIELD_HINTS)
        console.error('[mileage-log-card] screenshot analysis failed', {
          error: result.error,
          message: result.message,
          errorCode: result.errorCode,
          error_code: result.error_code,
          diagnostics: result.diagnostics,
        })
        return
      }

      const extraction = result.extraction
      setFieldHints(buildFieldHints(extraction))
      setForm(
        applyExtractionToForm(extraction, {
          ...initialFormState(),
          imageHash: result.image_hash,
        }),
      )

      if (!hasMinimumScreenshotExtraction(extraction)) {
        const ui = resolveAnalysisUi(extraction)
        setAnalysisStatus(ui.status)
        setAnalysisMessage(ui.message)
        console.error('[mileage-log-card] extraction empty after ok response', {
          diagnostics: result.diagnostics,
          extraction,
        })
        return
      }

      const ui = resolveAnalysisUi(extraction)
      setAnalysisStatus(ui.status)
      setAnalysisMessage(ui.message)

      console.info('[mileage-log-card] screenshot analysis applied to form', {
        distanceKm: extraction.distance_km,
        duration: extraction.duration,
        pace: extraction.pace,
        heartRate: extraction.heart_rate,
        calories: extraction.calories,
        date: extraction.activity_date,
        startTime: extraction.activity_time,
        status: ui.status,
        message: ui.message,
        analysis_success: extraction.analysis_success,
      })
    } catch (error) {
      setAnalysisStatus('failed')
      setAnalysisMessage(screenshotApiErrorMessage('UNKNOWN_ERROR'))
      setFieldHints(EMPTY_FIELD_HINTS)
      console.error('[mileage-log-card] screenshot analysis threw', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const embedded = variant === 'embedded'

  if (!tableReady) {
    return (
      <div className={embedded ? 'space-y-2' : 'rounded-xl border border-border/60 bg-card p-4 shadow-sm'}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Route className="h-4 w-4 shrink-0" />
          <span>월 누적 마일리지</span>
        </div>
        <p className="text-sm text-muted-foreground">DB 설정이 필요합니다.</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className={embedded ? 'space-y-2' : 'rounded-xl border border-border/60 bg-card p-4 shadow-sm'}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Route className="h-4 w-4 shrink-0" />
          <span>월 누적 마일리지</span>
        </div>
        <p className="text-sm text-muted-foreground">러닝 리그 참가 후 기록할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          embedded ? 'space-y-2' : 'rounded-xl border border-border/60 bg-card p-4 shadow-sm',
        )}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Route className="h-4 w-4 shrink-0" />
          <span>월 누적 마일리지</span>
        </div>

        <p className={cn('font-bold text-lime-400', embedded ? 'text-2xl' : 'text-3xl')}>
          {mileageKm.toFixed(1)}km
        </p>
        <p className="text-xs text-muted-foreground">
          마일리지 점수 {mileageScore}점 · {MILEAGE_SCORE_CAP_KM}km 만점
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleScreenshotChange}
        />

        {!open ? (
          <div className={cn('space-y-2', embedded ? 'pt-1' : 'mt-3')}>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 flex-1"
                onClick={() => {
                  resetForm()
                  setOpen(true)
                }}
              >
                러닝 기록 추가
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={analysisStatus === 'analyzing'}
                aria-label="스크린샷으로 기록 추가"
              >
                {analysisStatus === 'analyzing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-between px-1 text-xs text-muted-foreground"
              onClick={() => setListOpen((value) => !value)}
            >
              <span>이번 달 기록 목록 ({mileageLogs.length}건)</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', listOpen && 'rotate-180')} />
            </Button>

            {listOpen ? (
              <MileageLogList
                logs={mileageLogs}
                selectedLogId={selectedLogId}
                editingLogId={editingLogId}
                onSelect={(id) => setSelectedLogId((current) => (current === id ? null : id))}
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
                deleting={deleting}
              />
            ) : null}
          </div>
        ) : (
          <div className={cn('space-y-3', embedded ? 'pt-1' : 'mt-3')}>
            {previewUrl ? (
              <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="러닝 스크린샷" className="max-h-40 w-full object-contain" />
              </div>
            ) : null}

            {analysisStatus === 'analyzing' ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                사진 분석 중…
              </div>
            ) : null}

            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={analysisStatus === 'analyzing'}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                스크린샷 첨부
              </Button>

              {analysisMessage ? (
                <p
                  className={cn(
                    'text-[11px] font-medium',
                    analysisStatus === 'failed'
                      ? 'text-amber-300'
                      : analysisStatus === 'partial'
                        ? 'text-amber-200'
                        : 'text-emerald-400',
                  )}
                >
                  {analysisMessage}
                </p>
              ) : null}

              {(analysisStatus === 'success' || analysisStatus === 'partial') && (
                <AnalysisSummary form={form} fieldHints={fieldHints} />
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className={fieldLabelClass(fieldHints.distanceKm)}>거리 (km)</Label>
                    <Input
                      className={fieldInputClass(fieldHints.distanceKm)}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="예: 13.50"
                      value={form.distanceKm}
                      onChange={(event) => updateForm({ distanceKm: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass(fieldHints.duration)}>총 시간</Label>
                    <Input
                      className={fieldInputClass(fieldHints.duration)}
                      placeholder="1:00:27"
                      value={form.duration}
                      onChange={(event) => updateForm({ duration: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass(fieldHints.pace)}>페이스 (/km)</Label>
                    <Input
                      className={fieldInputClass(fieldHints.pace)}
                      placeholder="4:29"
                      value={form.pace}
                      onChange={(event) => updateForm({ pace: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass(fieldHints.heartRate)}>심박수 (bpm)</Label>
                    <Input
                      className={fieldInputClass(fieldHints.heartRate)}
                      inputMode="numeric"
                      placeholder="154"
                      value={form.heartRate}
                      onChange={(event) => updateForm({ heartRate: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabelClass(fieldHints.calories)}>칼로리 (kcal)</Label>
                    <Input
                      className={fieldInputClass(fieldHints.calories)}
                      inputMode="numeric"
                      placeholder="714"
                      value={form.calories}
                      onChange={(event) => updateForm({ calories: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className={fieldLabelClass(fieldHints.loggedAt)}>
                    날짜
                    {fieldHints.loggedAt === 'review' ? ' (확인 필요)' : ''}
                  </Label>
                  <KoreanDatePicker
                    value={form.loggedAt}
                    onChange={(value) => updateForm({ loggedAt: value })}
                    compact
                    placeholder="날짜 선택"
                    className={cn(
                      fieldHints.loggedAt === 'review' && 'ring-1 ring-amber-400/50',
                      fieldHints.loggedAt === 'filled' && 'ring-1 ring-emerald-500/30',
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <Label className={fieldLabelClass(fieldHints.activityTime)}>운동 시각 (HH:mm)</Label>
                  <Input
                    className={fieldInputClass(fieldHints.activityTime)}
                    placeholder="11:05"
                    value={form.activityTime}
                    onChange={(event) => updateForm({ activityTime: event.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-between px-1 text-xs text-muted-foreground"
                    onClick={() => setListOpen((value) => !value)}
                  >
                    <span>이번 달 기록 목록 ({mileageLogs.length}건)</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', listOpen && 'rotate-180')} />
                  </Button>
                  {listOpen ? (
                    <MileageLogList
                      logs={mileageLogs}
                      selectedLogId={selectedLogId}
                      editingLogId={editingLogId}
                      onSelect={(id) => setSelectedLogId((current) => (current === id ? null : id))}
                      onEdit={handleEditLog}
                      onDelete={handleDeleteLog}
                      deleting={deleting}
                    />
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1"
                    onClick={() => submitSave(false)}
                    disabled={saving || analysisStatus === 'analyzing'}
                  >
                    {saving ? '저장 중…' : editingLogId ? '수정 저장' : '기록 저장'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      setOpen(false)
                      resetForm()
                    }}
                    disabled={saving || analysisStatus === 'analyzing'}
                  >
                    닫기
                  </Button>
                </div>
              </>
          </div>
        )}
      </div>

      <AlertDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>비슷한 기록이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              이미 비슷한 러닝 기록이 있습니다. 그래도 저장할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDuplicateOpen(false)
                void submitSave(true)
              }}
            >
              그래도 저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatLogShortDate(deleteTarget.logged_at)} · ${Number(deleteTarget.distance_km).toFixed(1)}km 기록을 삭제합니다.`
                : '선택한 기록을 삭제합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
