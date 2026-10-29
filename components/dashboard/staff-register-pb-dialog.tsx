'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
  listAdultRunningMembersForPicker,
  type MemberPickerOption,
} from '@/lib/actions/members'
import { saveMemberRunningPb } from '@/lib/actions/running-league'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import { PB_COMPETITION_NAME_MAX_LENGTH } from '@/lib/running-league/pb-portal-history'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { matchKoreanNameSearch } from '@/lib/korean-search'
import type { RunningLeagueDistanceEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const PB_CREATE_DISTANCES: RunningLeagueDistanceEvent[] = [
  '5km',
  '10km',
  'half',
  'full',
]

type StaffRegisterPbDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDistance?: RunningLeagueDistanceEvent
}

export function StaffRegisterPbDialog({
  open,
  onOpenChange,
  initialDistance = '10km',
}: StaffRegisterPbDialogProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [members, setMembers] = useState<MemberPickerOption[] | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MemberPickerOption | null>(null)
  const [distanceEvent, setDistanceEvent] =
    useState<RunningLeagueDistanceEvent>(initialDistance)
  const [timeText, setTimeText] = useState('')
  const [measuredAt, setMeasuredAt] = useState(getKstDateKey())
  const [competitionName, setCompetitionName] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(null)
    setDistanceEvent(initialDistance)
    setTimeText('')
    setMeasuredAt(getKstDateKey())
    setCompetitionName('')
    if (members) return
    setLoadingMembers(true)
    void listAdultRunningMembersForPicker(300)
      .then((rows) => setMembers(rows))
      .catch(() => {
        toast.error('회원 목록을 불러오지 못했습니다.')
        onOpenChange(false)
      })
      .finally(() => setLoadingMembers(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/initial only
  }, [open, initialDistance])

  const filteredMembers = useMemo(() => {
    const rows = members ?? []
    const q = query.trim()
    if (!q) return rows
    return rows.filter(
      (member) =>
        matchKoreanNameSearch(member.name, q) ||
        (member.sport ?? '').toLowerCase().includes(q.toLowerCase()),
    )
  }, [members, query])

  function handleSave() {
    if (!selected || pending) return
    if (!timeText.trim()) {
      toast.error('기록을 입력해주세요.')
      return
    }
    startTransition(async () => {
      const result = await saveMemberRunningPb({
        distance_event: distanceEvent,
        time_text: timeText,
        measured_at: measuredAt,
        competition_name: competitionName,
        forMemberId: selected.id,
      })
      if (!result.ok) {
        toast.error('PB 등록 실패', { description: result.error })
        return
      }
      toast.success(`${selected.name} 님 PB를 등록했습니다.`)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PB 등록</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {selected
              ? `${selected.name} 님의 PB를 등록합니다.`
              : '이름을 검색해 회원을 선택한 뒤 PB를 등록하세요.'}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름 검색"
              className="border-lime-500/20 bg-black/40"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-800">
              {loadingMembers ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중…
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">회원이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {filteredMembers.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(member)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-lime-500/10"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-zinc-100">{member.name}</span>
                          {member.sport ? (
                            <span className="block truncate text-[11px] text-zinc-500">
                              {member.sport}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500">선택</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-lime-500/20 bg-black/30 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-lime-50">{selected.name}</p>
                {selected.sport ? (
                  <p className="truncate text-[11px] text-zinc-500">{selected.sport}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => setSelected(null)}
              >
                다시 선택
              </Button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">거리</p>
              <div className="grid grid-cols-4 gap-1">
                {PB_CREATE_DISTANCES.map((distance) => (
                  <Button
                    key={distance}
                    type="button"
                    size="sm"
                    variant={distanceEvent === distance ? 'default' : 'outline'}
                    className={cn(
                      'h-8 px-1 text-[11px]',
                      distanceEvent === distance
                        ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                        : 'border-lime-500/25',
                    )}
                    onClick={() => setDistanceEvent(distance)}
                  >
                    {formatPbDistanceLabel(distance)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">기록 (예: 58:04)</p>
              <Input
                value={timeText}
                onChange={(event) => setTimeText(event.target.value)}
                className="border-lime-500/20 bg-black/40"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">달성일</p>
              <Input
                type="date"
                value={measuredAt}
                onChange={(event) => setMeasuredAt(event.target.value)}
                className="border-lime-500/20 bg-black/40"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400">대회명</p>
              <Input
                value={competitionName}
                maxLength={PB_COMPETITION_NAME_MAX_LENGTH}
                onChange={(event) => setCompetitionName(event.target.value)}
                placeholder="예: 서울마라톤"
                className="border-lime-500/20 bg-black/40"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          {selected ? (
            <Button
              type="button"
              disabled={pending || !timeText.trim()}
              onClick={handleSave}
              className="bg-lime-400 text-zinc-950 hover:bg-lime-300"
            >
              {pending ? '등록 중…' : 'PB 등록'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
