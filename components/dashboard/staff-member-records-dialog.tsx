'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  deleteMemberMileageLog,
  deleteMemberRunningPbRecord,
  fetchStaffMemberRecords,
  saveMemberRunningPb,
  updateMemberMileageLog,
} from '@/lib/actions/running-league'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import { isOfflineClassAttendanceLog } from '@/lib/running-league/attendance-king'
import type { PortalPbRecordListItem } from '@/lib/running-league/pb-portal-history'
import type { RunningLeagueDistanceEvent, RunningLeagueMileageLog } from '@/lib/types'
import { cn } from '@/lib/utils'

type StaffMemberRecordsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string
  memberName: string
}

type EditMileageState = {
  log: RunningLeagueMileageLog
  distanceKm: string
  loggedAt: string
}

type EditPbState = {
  record: PortalPbRecordListItem
  timeText: string
  measuredAt: string
}

function formatLogDate(value: string): string {
  const raw = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return raw
  return `${Number(match[2])}/${Number(match[3])}`
}

export function StaffMemberRecordsDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
}: StaffMemberRecordsDialogProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'mileage' | 'pb'>('mileage')
  const [displayName, setDisplayName] = useState(memberName)
  const [mileageLogs, setMileageLogs] = useState<RunningLeagueMileageLog[]>([])
  const [pbRecords, setPbRecords] = useState<PortalPbRecordListItem[]>([])
  const [editMileage, setEditMileage] = useState<EditMileageState | null>(null)
  const [editPb, setEditPb] = useState<EditPbState | null>(null)
  const [deleteMileage, setDeleteMileage] = useState<RunningLeagueMileageLog | null>(null)
  const [deletePb, setDeletePb] = useState<PortalPbRecordListItem | null>(null)

  function reload() {
    setLoading(true)
    void fetchStaffMemberRecords(memberId).then((result) => {
      setLoading(false)
      if (!result.ok) {
        toast.error('기록 불러오기 실패', { description: result.error })
        onOpenChange(false)
        return
      }
      setDisplayName(result.memberName)
      setMileageLogs(result.mileageLogs)
      setPbRecords(result.pbRecords)
    })
  }

  useEffect(() => {
    if (!open) return
    setTab('mileage')
    setEditMileage(null)
    setEditPb(null)
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/memberId only
  }, [open, memberId])

  function handleSaveMileage() {
    if (!editMileage || pending) return
    const distanceKm = Number(editMileage.distanceKm)
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      toast.error('거리(km)를 확인해 주세요.')
      return
    }
    startTransition(async () => {
      const result = await updateMemberMileageLog(
        editMileage.log.id,
        {
          distance_km: distanceKm,
          logged_at: editMileage.loggedAt,
          notes: editMileage.log.notes,
          source: editMileage.log.source,
          skip_duplicate_check: true,
          forMemberId: memberId,
        },
      )
      if (!result.ok) {
        toast.error('마일리지 수정 실패', { description: result.error })
        return
      }
      toast.success('마일리지 기록을 수정했습니다.')
      setEditMileage(null)
      reload()
      router.refresh()
    })
  }

  function handleDeleteMileage() {
    if (!deleteMileage || pending) return
    startTransition(async () => {
      const result = await deleteMemberMileageLog(deleteMileage.id, {
        forMemberId: memberId,
      })
      if (!result.ok) {
        toast.error('마일리지 삭제 실패', { description: result.error })
        return
      }
      toast.success('마일리지 기록을 삭제했습니다.')
      setDeleteMileage(null)
      reload()
      router.refresh()
    })
  }

  function handleSavePb() {
    if (!editPb || pending) return
    startTransition(async () => {
      const result = await saveMemberRunningPb({
        distance_event: editPb.record.distance_event,
        time_text: editPb.timeText,
        measured_at: editPb.measuredAt,
        editing_record_id: editPb.record.id,
        editing_is_current: editPb.record.isCurrent,
        forMemberId: memberId,
      })
      if (!result.ok) {
        toast.error('PB 수정 실패', { description: result.error })
        return
      }
      toast.success('PB 기록을 수정했습니다.')
      setEditPb(null)
      reload()
      router.refresh()
    })
  }

  function handleDeletePb() {
    if (!deletePb || pending) return
    startTransition(async () => {
      const result = await deleteMemberRunningPbRecord({
        record_id: deletePb.id,
        forMemberId: memberId,
      })
      if (!result.ok) {
        toast.error('PB 삭제 실패', { description: result.error })
        return
      }
      toast.success('PB 기록을 삭제했습니다.')
      setDeletePb(null)
      reload()
      router.refresh()
    })
  }

  const runnableMileage = mileageLogs.filter((log) => !isOfflineClassAttendanceLog(log))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-hidden border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>기록 관리</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {displayName} · 마일리지·PB 기록을 수정하거나 삭제할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={tab === 'mileage' ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                tab === 'mileage'
                  ? 'bg-lime-400 text-zinc-950 hover:bg-lime-300'
                  : 'border-lime-500/30',
              )}
              onClick={() => setTab('mileage')}
            >
              마일리지
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === 'pb' ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                tab === 'pb'
                  ? 'bg-lime-400 text-zinc-950 hover:bg-lime-300'
                  : 'border-lime-500/30',
              )}
              onClick={() => setTab('pb')}
            >
              PB
            </Button>
          </div>

          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <p className="py-6 text-center text-sm text-zinc-400">불러오는 중…</p>
            ) : tab === 'mileage' ? (
              runnableMileage.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">마일리지 기록이 없습니다.</p>
              ) : (
                runnableMileage.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 rounded-lg border border-lime-500/20 bg-black/30 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-lime-50">
                        {formatLogDate(log.logged_at)} · {Number(log.distance_km).toFixed(1)}km
                      </p>
                      {log.notes?.trim() ? (
                        <p className="truncate text-[11px] text-zinc-500">{log.notes}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-300"
                      disabled={pending}
                      onClick={() =>
                        setEditMileage({
                          log,
                          distanceKm: String(log.distance_km),
                          loggedAt: log.logged_at.slice(0, 10),
                        })
                      }
                      aria-label="마일리지 수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-rose-300"
                      disabled={pending}
                      onClick={() => setDeleteMileage(log)}
                      aria-label="마일리지 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )
            ) : pbRecords.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">PB 기록이 없습니다.</p>
            ) : (
              pbRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-2 rounded-lg border border-lime-500/20 bg-black/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-lime-50">
                      {formatPbDistanceLabel(record.distance_event as RunningLeagueDistanceEvent)}{' '}
                      {record.time_text}
                      {record.isCurrent ? (
                        <span className="ml-1 text-[10px] text-lime-300">PB</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {formatLogDate(record.measured_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-zinc-300"
                    disabled={pending}
                    onClick={() =>
                      setEditPb({
                        record,
                        timeText: record.time_text,
                        measuredAt: record.measured_at.slice(0, 10),
                      })
                    }
                    aria-label="PB 수정"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-rose-300"
                    disabled={pending}
                    onClick={() => setDeletePb(record)}
                    aria-label="PB 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMileage != null} onOpenChange={(next) => !next && setEditMileage(null)}>
        <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>마일리지 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">날짜</p>
              <Input
                type="date"
                value={editMileage?.loggedAt ?? ''}
                onChange={(event) =>
                  setEditMileage((current) =>
                    current ? { ...current, loggedAt: event.target.value } : current,
                  )
                }
                className="border-lime-500/20 bg-black/40"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">거리 (km)</p>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={editMileage?.distanceKm ?? ''}
                onChange={(event) =>
                  setEditMileage((current) =>
                    current ? { ...current, distanceKm: event.target.value } : current,
                  )
                }
                className="border-lime-500/20 bg-black/40"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditMileage(null)}>
              취소
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={handleSaveMileage}
              className="bg-lime-400 text-zinc-950 hover:bg-lime-300"
            >
              {pending ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPb != null} onOpenChange={(next) => !next && setEditPb(null)}>
        <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>PB 수정</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editPb
                ? formatPbDistanceLabel(editPb.record.distance_event as RunningLeagueDistanceEvent)
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">기록 (예: 58:04)</p>
              <Input
                value={editPb?.timeText ?? ''}
                onChange={(event) =>
                  setEditPb((current) =>
                    current ? { ...current, timeText: event.target.value } : current,
                  )
                }
                className="border-lime-500/20 bg-black/40"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">측정일</p>
              <Input
                type="date"
                value={editPb?.measuredAt ?? ''}
                onChange={(event) =>
                  setEditPb((current) =>
                    current ? { ...current, measuredAt: event.target.value } : current,
                  )
                }
                className="border-lime-500/20 bg-black/40"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditPb(null)}>
              취소
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={handleSavePb}
              className="bg-lime-400 text-zinc-950 hover:bg-lime-300"
            >
              {pending ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteMileage != null}
        onOpenChange={(next) => !next && setDeleteMileage(null)}
      >
        <AlertDialogContent className="border-lime-500/25 bg-zinc-950 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>마일리지 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {deleteMileage
                ? `${formatLogDate(deleteMileage.logged_at)} · ${Number(deleteMileage.distance_km).toFixed(1)}km 기록을 삭제합니다.`
                : '선택한 기록을 삭제합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={handleDeleteMileage}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {pending ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePb != null} onOpenChange={(next) => !next && setDeletePb(null)}>
        <AlertDialogContent className="border-lime-500/25 bg-zinc-950 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>PB 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {deletePb
                ? `${formatPbDistanceLabel(deletePb.distance_event as RunningLeagueDistanceEvent)} ${deletePb.time_text} 기록을 삭제합니다.`
                : '선택한 PB를 삭제합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={handleDeletePb}
              className="bg-rose-500 text-white hover:bg-rose-400"
            >
              {pending ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
