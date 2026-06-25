'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { saveMemberRunningPb, deleteMemberRunningPbRecord, fetchMyPortalPbRecords, fetchMyPortalPbRecordListAll } from '@/lib/actions/running-league'
import type { PortalPbRecordListItem } from '@/lib/running-league/pb-portal-history'
import {
  resolvePortalPbRecordListAll,
} from '@/lib/running-league/pb-portal-history'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const DISTANCE_EVENTS: RunningLeagueDistanceEvent[] = ['10km', 'half', 'full']

const DISTANCE_LABELS: Record<(typeof DISTANCE_EVENTS)[number], string> = {
  '10km': '10km',
  half: 'Half',
  full: 'Full',
}

function formatDistanceLabel(event: RunningLeagueDistanceEvent): string {
  if ((DISTANCE_EVENTS as readonly string[]).includes(event)) {
    return DISTANCE_LABELS[event as (typeof DISTANCE_EVENTS)[number]]
  }
  const extra: Partial<Record<RunningLeagueDistanceEvent, string>> = {
    '1km': '1km',
    '3km': '3km',
    '5km': '5km',
  }
  return extra[event] ?? event
}

interface MemberRunningPbPanelProps {
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  tableReady: boolean
  readOnly?: boolean
  variant?: 'default' | 'embedded'
}

export type MemberRunningPbDialogProps = {
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  tableReady: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly?: boolean
  portalRecordReady?: boolean
  initialDistance?: RunningLeagueDistanceEvent
}

function PbSectionLabel({ embedded }: { embedded?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 font-medium leading-none text-muted-foreground',
        embedded ? 'text-sm' : 'text-xs',
      )}
    >
      {embedded ? <span className="inline-flex h-4 w-4 shrink-0" aria-hidden /> : null}
      <span>개인 러닝 PB</span>
    </div>
  )
}

function resolvePortalDistance(distance: RunningLeagueDistanceEvent): (typeof DISTANCE_EVENTS)[number] {
  return (DISTANCE_EVENTS as readonly RunningLeagueDistanceEvent[]).includes(distance)
    ? (distance as (typeof DISTANCE_EVENTS)[number])
    : '10km'
}

function findPortalPbRecord(
  pbRecords: RunningLeagueRecord[],
  event: (typeof DISTANCE_EVENTS)[number],
): RunningLeagueRecord | null {
  const forDistance = pbRecords.filter((row) => row.distance_event === event)
  const record =
    forDistance.find((row) => row.record_phase === 'other') ??
    forDistance.find((row) => row.record_phase !== 'pb_history')
  return record?.time_text?.trim() ? record : null
}

function applyPbRecordToForm(
  pbRecords: RunningLeagueRecord[],
  event: (typeof DISTANCE_EVENTS)[number],
  setTimeText: (value: string) => void,
  setMeasuredAt: (value: string) => void,
) {
  const record = findPortalPbRecord(pbRecords, event)
  setTimeText(record?.time_text?.trim() ?? '')
  setMeasuredAt(
    record?.measured_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  )
}


function formatPbDateTime(value: string): string {
  try {
    return format(parseISO(value), 'yyyy.M.d (EEE)', { locale: ko })
  } catch {
    return value
  }
}

function CurrentPbDraftCard({
  distance,
  timeText,
  measuredAt,
}: {
  distance: (typeof DISTANCE_EVENTS)[number]
  timeText: string
  measuredAt: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">내 등록 기록</Label>
      <div className="rounded-lg border border-primary/45 bg-primary/5 px-3 py-2.5">
        <p className="text-xs font-medium text-foreground">
          {formatDistanceLabel(distance)}{' '}
          <span className="text-primary">선택 중</span>
        </p>
        {timeText.trim() ? (
          <>
            <p className="mt-1 text-2xl font-bold leading-none tabular-nums text-primary">{timeText}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{formatPbDateTime(measuredAt)} 측정</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">기록을 입력한 뒤 저장하세요.</p>
        )}
      </div>
    </div>
  )
}

function PbHistoryListPanel({
  listItems,
  editingRecordId,
  pending,
  deletePending,
  onEdit,
  onRequestDelete,
}: {
  listItems: PortalPbRecordListItem[]
  editingRecordId: string | null
  pending: boolean
  deletePending: boolean
  onEdit: (item: PortalPbRecordListItem) => void
  onRequestDelete: (item: PortalPbRecordListItem) => void
}) {
  const [listOpen, setListOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-background/30">
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-muted/20"
        onClick={() => setListOpen((value) => !value)}
        aria-expanded={listOpen}
        aria-controls="pb-history-list-panel"
      >
        <span className="text-xs font-medium text-foreground">PB 기록 목록 ({listItems.length}건)</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', listOpen && 'rotate-180')}
        />
      </button>

      {listOpen ? (
        <div id="pb-history-list-panel" className="space-y-2 border-t border-border/40 p-2">
          {listItems.length > 0 ? (
            <ul className="max-h-52 space-y-2 overflow-y-auto">
              {listItems.map((item) => {
                const editing = editingRecordId === item.id
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'rounded-lg border px-3 py-2.5',
                      editing ? 'border-primary/45 bg-primary/5' : 'border-border/60 bg-background/40',
                    )}
                  >
                    <p className="text-xs font-medium text-foreground">
                      {formatDistanceLabel(item.distance_event)}
                      {item.isCurrent ? (
                        <span className="ml-1.5 text-[10px] font-normal text-primary">현재 PB</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xl font-bold leading-none tabular-nums text-primary">{item.time_text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatPbDateTime(item.measured_at)} 측정</p>
                    <div className="mt-2 flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={pending || deletePending}
                        onClick={() => onEdit(item)}
                      >
                        수정
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                        disabled={pending || deletePending}
                        onClick={() => onRequestDelete(item)}
                      >
                        <Trash2 className="mr-1 inline h-3 w-3" />
                        삭제
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
              저장한 PB 기록이 여기에 날짜순으로 표시됩니다.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function useMemberRunningPbForm(
  participant: RunningLeagueParticipant | null,
  pbRecords: RunningLeagueRecord[],
  initialDistance: RunningLeagueDistanceEvent = '10km',
  onPbRecordsChange?: (records: RunningLeagueRecord[]) => void,
  onRecordListChange?: (items: PortalPbRecordListItem[]) => void,
) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [distance, setDistanceState] = useState<(typeof DISTANCE_EVENTS)[number]>(() =>
    resolvePortalDistance(initialDistance),
  )
  const [timeText, setTimeText] = useState('')
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10))
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [editingIsCurrent, setEditingIsCurrent] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PortalPbRecordListItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function setDistance(value: (typeof DISTANCE_EVENTS)[number]) {
    setDistanceState(value)
    applyPbRecordToForm(pbRecords, value, setTimeText, setMeasuredAt)
    setSelectedRecordId(null)
    setEditingRecordId(null)
    setEditingIsCurrent(false)
  }

  const resetToDistance = useCallback(
    (value: RunningLeagueDistanceEvent, sourceRecords: RunningLeagueRecord[] = pbRecords) => {
      const resolved = resolvePortalDistance(value)
      setDistanceState(resolved)
      applyPbRecordToForm(sourceRecords, resolved, setTimeText, setMeasuredAt)
    },
    [pbRecords],
  )

  async function applyRecordsUpdate(records: RunningLeagueRecord[]) {
    onPbRecordsChange?.(records)
    await reloadAllRecordList(records)
    applyPbRecordToForm(records, distance, setTimeText, setMeasuredAt)
    setEditingRecordId(null)
    setSelectedRecordId(null)
    setEditingIsCurrent(false)
  }

  function handleEditListItem(item: PortalPbRecordListItem) {
    const resolved = resolvePortalDistance(item.distance_event)
    setDistanceState(resolved)
    setTimeText(item.time_text)
    setMeasuredAt(item.measured_at.slice(0, 10))
    setEditingRecordId(item.id)
    setEditingIsCurrent(item.isCurrent)
    setSelectedRecordId(item.id)
  }

  function handleStartNewRecord() {
    setEditingRecordId(null)
    setEditingIsCurrent(false)
    setSelectedRecordId(null)
    setTimeText('')
    setMeasuredAt(new Date().toISOString().slice(0, 10))
  }

  async function reloadAllRecordList(sourceRecords: RunningLeagueRecord[] = pbRecords) {
    const result = await fetchMyPortalPbRecordListAll()
    if (result.ok) {
      onRecordListChange?.(resolvePortalPbRecordListAll(sourceRecords, result.items))
    } else {
      onRecordListChange?.(resolvePortalPbRecordListAll(sourceRecords, []))
    }
  }

  function handleSave(onSuccess?: () => void) {
    if (!timeText.trim()) {
      toast.error('기록을 입력해주세요.')
      return
    }

    startTransition(async () => {
      const isEditing =
        editingRecordId != null &&
        !editingRecordId.startsWith('draft:') &&
        !editingRecordId.startsWith('current:')

      const result = await saveMemberRunningPb({
        distance_event: distance,
        time_text: timeText.trim(),
        measured_at: measuredAt,
        editing_record_id: isEditing ? editingRecordId : undefined,
        editing_is_current: isEditing ? editingIsCurrent : undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await applyRecordsUpdate(result.pbRecords)
      const listResult = await fetchMyPortalPbRecordListAll()
      const totalCount = listResult.ok ? listResult.items.length : result.recordList.length
      toast.success(
        isEditing
          ? '기록이 수정되었습니다.'
          : totalCount > 1
            ? `기록이 저장되었습니다. (총 ${totalCount}건)`
            : '기록이 저장되었습니다.',
      )
      onSuccess?.()
      router.refresh()
    })
  }

  function handleRequestDeleteRecord(item: PortalPbRecordListItem) {
    if (item.id.startsWith('draft:')) {
      toast.error('저장 후 삭제할 수 있습니다.')
      return
    }
    setDeleteTarget(item)
    setDeleteOpen(true)
  }

  function handleDeleteRecord(
    item: PortalPbRecordListItem,
    onSuccess?: () => void,
  ) {
    startDeleteTransition(async () => {
      const result = await deleteMemberRunningPbRecord({ record_id: item.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await applyRecordsUpdate(result.pbRecords)
      toast.success(item.isCurrent ? 'PB 기록을 삭제했습니다.' : '이전 기록을 삭제했습니다.')
      setDeleteOpen(false)
      setDeleteTarget(null)
      onSuccess?.()
      router.refresh()
    })
  }

  return {
    distance,
    setDistance,
    resetToDistance,
    timeText,
    setTimeText,
    measuredAt,
    setMeasuredAt,
    selectedRecordId,
    setSelectedRecordId,
    editingRecordId,
    pending,
    deletePending,
    handleSave,
    handleDeleteRecord,
    handleRequestDeleteRecord,
    handleEditListItem,
    handleStartNewRecord,
    reloadAllRecordList,
    deleteOpen,
    deleteTarget,
    setDeleteOpen,
    setDeleteTarget,
  }
}

function RunningPbFormFields({
  distance,
  setDistance,
  timeText,
  setTimeText,
  measuredAt,
  setMeasuredAt,
  editingRecordId,
  pending,
  deletePending,
  allRecordList,
  onEditListItem,
  onStartNewRecord,
  onRequestDelete,
  onSave,
  onCancel,
  deleteOpen,
  deleteTarget,
  onDeleteOpenChange,
  onConfirmDelete,
}: {
  distance: (typeof DISTANCE_EVENTS)[number]
  setDistance: (value: (typeof DISTANCE_EVENTS)[number]) => void
  timeText: string
  setTimeText: (value: string) => void
  measuredAt: string
  setMeasuredAt: (value: string) => void
  editingRecordId: string | null
  pending: boolean
  deletePending: boolean
  allRecordList: PortalPbRecordListItem[]
  onEditListItem: (item: PortalPbRecordListItem) => void
  onStartNewRecord: () => void
  onRequestDelete: (item: PortalPbRecordListItem) => void
  onSave: () => void
  onCancel?: () => void
  deleteOpen: boolean
  deleteTarget: PortalPbRecordListItem | null
  onDeleteOpenChange: (open: boolean) => void
  onConfirmDelete: () => void
}) {
  return (
    <>
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">종목</Label>
          <Select value={distance} onValueChange={(value) => setDistance(value as (typeof DISTANCE_EVENTS)[number])}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTANCE_EVENTS.map((event) => (
                <SelectItem key={event} value={event}>
                  {DISTANCE_LABELS[event]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">기록</Label>
          <Input
            className="h-9"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder="32:10"
          />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] text-muted-foreground">측정일</Label>
          {editingRecordId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-muted-foreground"
              onClick={onStartNewRecord}
            >
              새 기록 입력
            </Button>
          ) : null}
        </div>
        <KoreanDatePicker value={measuredAt} onChange={setMeasuredAt} compact placeholder="날짜 선택" />
      </div>
      <CurrentPbDraftCard distance={distance} timeText={timeText} measuredAt={measuredAt} />
      <PbHistoryListPanel
        listItems={allRecordList}
        editingRecordId={editingRecordId}
        pending={pending}
        deletePending={deletePending}
        onEdit={onEditListItem}
        onRequestDelete={onRequestDelete}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" className="h-9 flex-1" disabled={pending || deletePending} onClick={onSave}>
          {pending ? '저장 중…' : editingRecordId ? '수정 저장' : 'PB 저장'}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" className="h-9" disabled={pending || deletePending} onClick={onCancel}>
            닫기
          </Button>
        ) : null}
      </div>
    </div>

    <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>PB 기록을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget
              ? `${formatDistanceLabel(deleteTarget.distance_event)} ${deleteTarget.time_text} (${formatPbDateTime(deleteTarget.measured_at)}) 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
              : '선택한 PB 기록을 삭제합니다.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletePending}>취소</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deletePending}
            onClick={(event) => {
              event.preventDefault()
              onConfirmDelete()
            }}
          >
            {deletePending ? '삭제 중…' : '삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

export function MemberRunningPbDialog({
  participant,
  pbRecords,
  tableReady,
  open,
  onOpenChange,
  readOnly = false,
  portalRecordReady = false,
  initialDistance = '10km',
}: MemberRunningPbDialogProps) {
  const [records, setRecords] = useState(pbRecords)
  const [recordList, setRecordList] = useState<PortalPbRecordListItem[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const form = useMemberRunningPbForm(
    participant,
    records,
    initialDistance,
    setRecords,
    setRecordList,
  )
  const { resetToDistance, reloadAllRecordList, handleDeleteRecord, handleRequestDeleteRecord, deleteOpen, deleteTarget, setDeleteOpen, setDeleteTarget, ...formFields } = form
  const wasOpenRef = useRef(false)
  const hasPb = records.some(
    (record) => record.record_phase === 'other' && record.time_text?.trim(),
  )
  const canRecord = Boolean(participant) || portalRecordReady

  useEffect(() => {
    setRecords(pbRecords)
  }, [pbRecords])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return

    let cancelled = false
    setRecordsLoading(true)

    void (async () => {
      if (canRecord) {
        const [recordsResult, listResult] = await Promise.all([
          fetchMyPortalPbRecords(),
          fetchMyPortalPbRecordListAll(),
        ])
        if (!cancelled && recordsResult.ok) {
          setRecords(recordsResult.pbRecords)
          resetToDistance(initialDistance, recordsResult.pbRecords)
        }
        if (!cancelled) {
          const nextRecords = recordsResult.ok ? recordsResult.pbRecords : records
          const serverItems = listResult.ok ? listResult.items : []
          setRecordList(resolvePortalPbRecordListAll(nextRecords, serverItems))
        }
      }
      if (!cancelled) {
        setRecordsLoading(false)
        wasOpenRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canRecord, initialDistance, open, records, resetToDistance])

  if (!tableReady || readOnly) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>PB {hasPb ? '수정' : '등록'}</DialogTitle>
        </DialogHeader>
        {!canRecord ? (
          <p className="text-sm text-muted-foreground">PB를 등록할 수 없습니다.</p>
        ) : recordsLoading ? (
          <p className="text-sm text-muted-foreground">기록 불러오는 중…</p>
        ) : (
          <RunningPbFormFields
            {...formFields}
            allRecordList={recordList}
            onEditListItem={form.handleEditListItem}
            onStartNewRecord={form.handleStartNewRecord}
            onRequestDelete={handleRequestDeleteRecord}
            deleteOpen={deleteOpen}
            deleteTarget={deleteTarget}
            onDeleteOpenChange={(nextOpen) => {
              setDeleteOpen(nextOpen)
              if (!nextOpen) setDeleteTarget(null)
            }}
            onConfirmDelete={() => {
              if (deleteTarget) {
                handleDeleteRecord(deleteTarget)
              }
            }}
            onSave={() => form.handleSave()}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MemberRunningPbPanel({
  participant,
  pbRecords,
  tableReady,
  readOnly = false,
  variant = 'default',
}: MemberRunningPbPanelProps) {
  const embedded = variant === 'embedded'
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState(pbRecords)
  const [recordList, setRecordList] = useState<PortalPbRecordListItem[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const form = useMemberRunningPbForm(participant, records, '10km', setRecords, setRecordList)
  const {
    handleDeleteRecord,
    handleRequestDeleteRecord,
    deleteOpen,
    deleteTarget,
    setDeleteOpen,
    setDeleteTarget,
    ...panelFormFields
  } = form

  useEffect(() => {
    setRecords(pbRecords)
  }, [pbRecords])

  async function openEditor() {
    setOpen(true)
    setRecordsLoading(true)
    const [recordsResult, listResult] = await Promise.all([
      fetchMyPortalPbRecords(),
      fetchMyPortalPbRecordListAll(),
    ])
    if (recordsResult.ok) {
      setRecords(recordsResult.pbRecords)
      form.resetToDistance('10km', recordsResult.pbRecords)
    }
    if (listResult.ok) {
      setRecordList(
        resolvePortalPbRecordListAll(
          recordsResult.ok ? recordsResult.pbRecords : records,
          listResult.items,
        ),
      )
    } else if (recordsResult.ok) {
      setRecordList(resolvePortalPbRecordListAll(recordsResult.pbRecords, []))
    }
    setRecordsLoading(false)
  }

  const pbByDistance = useMemo(() => {
    const map = new Map<RunningLeagueDistanceEvent, RunningLeagueRecord>()
    for (const record of records) {
      if (record.record_phase !== 'other') continue
      map.set(record.distance_event, record)
    }
    return map
  }, [records])

  const primaryPb =
    pbByDistance.get('10km') ??
    pbByDistance.get('half') ??
    pbByDistance.get('full') ??
    records[0] ??
    null

  if (!tableReady) {
    return (
      <div className={cn(embedded && 'space-y-2')}>
        <PbSectionLabel embedded={embedded} />
        <p className="mt-2 text-sm text-muted-foreground">DB 설정이 필요합니다.</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className={cn(embedded && 'space-y-2')}>
        <PbSectionLabel embedded={embedded} />
        <p className="mt-2 text-sm text-muted-foreground">러닝 리그 참가 후 기록할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className={cn(embedded ? 'space-y-2' : 'space-y-2')}>
      <PbSectionLabel embedded={embedded} />
      {primaryPb?.time_text ? (
        <div className="mt-2">
          <p className="text-2xl font-bold leading-none text-primary lg:text-3xl">
            {primaryPb.distance_event} {primaryPb.time_text}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(parseISO(primaryPb.measured_at), 'yyyy.M.d (EEE)', { locale: ko })} 기록
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 등록된 PB가 없습니다.</p>
      )}

      {records.some((row) => row.record_phase === 'other' && row.time_text?.trim()) &&
      records.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {DISTANCE_EVENTS.map((event) => {
            const record = pbByDistance.get(event)
            if (!record?.time_text) return null
            return (
              <span
                key={event}
                className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {event} {record.time_text}
              </span>
            )
          })}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
          {recordsLoading ? (
            <p className="text-sm text-muted-foreground">기록 불러오는 중…</p>
          ) : (
            <RunningPbFormFields
              {...panelFormFields}
              allRecordList={recordList}
              onEditListItem={form.handleEditListItem}
              onStartNewRecord={form.handleStartNewRecord}
              onRequestDelete={handleRequestDeleteRecord}
              deleteOpen={deleteOpen}
              deleteTarget={deleteTarget}
              onDeleteOpenChange={(nextOpen) => {
                setDeleteOpen(nextOpen)
                if (!nextOpen) setDeleteTarget(null)
              }}
              onConfirmDelete={() => {
                if (deleteTarget) {
                  handleDeleteRecord(deleteTarget)
                }
              }}
              onSave={() => form.handleSave()}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
      ) : readOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full border-primary/30 bg-background/50 text-xs sm:w-auto"
          onClick={() => void openEditor()}
        >
          PB {primaryPb ? '수정' : '등록'}
        </Button>
      )}
    </div>
  )
}
