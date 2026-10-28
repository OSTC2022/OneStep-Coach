'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createMemberTrainingJournal,
  deleteMemberTrainingJournal,
  listMemberTrainingJournals,
  updateMemberTrainingJournal,
  type MemberTrainingJournal,
} from '@/lib/actions/member-training-journals'
import { getKstDateKey } from '@/lib/member-backup/kst-date'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type MemberTrainingJournalButtonProps = {
  memberId: string
  memberName: string
  compact?: boolean
  className?: string
}

function formatJournalDate(value: string) {
  try {
    return format(parseISO(`${value.slice(0, 10)}T12:00:00`), 'M월 d일 (EEE)', {
      locale: ko,
    })
  } catch {
    return value.slice(0, 10)
  }
}

function sortJournals(rows: MemberTrainingJournal[]) {
  return [...rows].sort((a, b) => {
    const byDate = b.training_date.localeCompare(a.training_date)
    if (byDate !== 0) return byDate
    return b.created_at.localeCompare(a.created_at)
  })
}

export function MemberTrainingJournalButton({
  memberId,
  memberName,
  compact = false,
  className,
}: MemberTrainingJournalButtonProps) {
  const [open, setOpen] = useState(false)
  const [journals, setJournals] = useState<MemberTrainingJournal[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [draftMode, setDraftMode] = useState(false)
  const [trainingDate, setTrainingDate] = useState(getKstDateKey())
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const current = !draftMode && journals.length > 0 ? journals[pageIndex] ?? null : null
  const pageLabel = useMemo(() => {
    if (draftMode || journals.length === 0) return '새 일지'
    return `${pageIndex + 1} / ${journals.length}`
  }, [draftMode, journals.length, pageIndex])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    startTransition(async () => {
      const result = await listMemberTrainingJournals(memberId)
      if (cancelled) return
      if (result.warning) {
        toast.warning('DB 마이그레이션 필요', { description: result.warning })
      }
      const ordered = sortJournals(result.data)
      setJournals(ordered)
      setLoaded(true)
      if (ordered.length === 0) {
        setDraftMode(true)
        setPageIndex(0)
        setTrainingDate(getKstDateKey())
        setBody('')
        return
      }
      setDraftMode(false)
      setPageIndex(0)
      setTrainingDate(ordered[0].training_date)
      setBody(ordered[0].body)
    })
    return () => {
      cancelled = true
    }
  }, [open, memberId])

  function showJournalAt(index: number, rows = journals) {
    const next = rows[index]
    if (!next) return
    setDraftMode(false)
    setPageIndex(index)
    setTrainingDate(next.training_date)
    setBody(next.body)
  }

  function startNewJournal() {
    setDraftMode(true)
    setTrainingDate(getKstDateKey())
    setBody('')
  }

  function handlePrev() {
    if (draftMode) {
      if (journals.length === 0) return
      showJournalAt(0)
      return
    }
    if (pageIndex >= journals.length - 1) return
    showJournalAt(pageIndex + 1)
  }

  function handleNext() {
    if (draftMode) return
    if (pageIndex <= 0) {
      startNewJournal()
      return
    }
    showJournalAt(pageIndex - 1)
  }

  function handleSave() {
    const trimmed = body.trim()
    if (!trimmed) {
      toast.error('훈련 내용을 입력해주세요.')
      return
    }

    startTransition(async () => {
      if (current) {
        const result = await updateMemberTrainingJournal(current.id, {
          trainingDate,
          body: trimmed,
        })
        if (result.error || !result.data) {
          toast.error('일지 수정 실패', { description: result.error })
          return
        }
        const next = sortJournals(
          journals.map((item) =>
            item.id === result.data!.id ? result.data! : item,
          ),
        )
        setJournals(next)
        const index = next.findIndex((item) => item.id === result.data!.id)
        showJournalAt(Math.max(0, index), next)
        toast.success('일지를 수정했습니다.')
        return
      }

      const result = await createMemberTrainingJournal({
        memberId,
        trainingDate,
        body: trimmed,
      })
      if (result.error || !result.data) {
        toast.error('일지 저장 실패', { description: result.error })
        return
      }
      const next = sortJournals([result.data, ...journals])
      setJournals(next)
      const index = next.findIndex((item) => item.id === result.data!.id)
      showJournalAt(Math.max(0, index), next)
      toast.success('훈련 일지를 저장했습니다.')
    })
  }

  function handleDelete() {
    if (!current) return
    if (!window.confirm('이 훈련 일지를 삭제할까요?')) return

    startTransition(async () => {
      const result = await deleteMemberTrainingJournal(current.id)
      if (result.error) {
        toast.error('일지 삭제 실패', { description: result.error })
        return
      }
      const next = journals.filter((item) => item.id !== current.id)
      setJournals(next)
      if (next.length === 0) {
        startNewJournal()
      } else {
        showJournalAt(Math.min(pageIndex, next.length - 1), next)
      }
      toast.success('일지를 삭제했습니다.')
    })
  }

  const canGoOlder = draftMode ? journals.length > 0 : pageIndex < journals.length - 1
  const canGoNewer = !draftMode
  const hasJournals = journals.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex shrink-0 items-center justify-center rounded border transition-colors',
            compact ? 'h-4 w-4' : 'h-5 w-5',
            hasJournals
              ? 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
              : 'border-dashed border-muted-foreground/40 bg-muted/20 text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground',
            className,
          )}
          title={
            hasJournals
              ? `${memberName} 훈련 일지 ${journals.length}건`
              : `${memberName} 훈련 일지`
          }
          aria-label={
            hasJournals
              ? `${memberName} 훈련 일지 ${journals.length}건`
              : `${memberName} 훈련 일지 작성`
          }
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <BookOpen className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
          {hasJournals ? (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[200] w-[min(100vw-1.5rem,20rem)] space-y-2.5 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-foreground">
              {memberName} 훈련 일지
            </p>
            <p className="text-[10px] text-muted-foreground">
              {draftMode ? '새 기록' : formatJournalDate(trainingDate)}
            </p>
          </div>
          {isPending || !loaded ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-1 rounded-md border border-border/70 bg-muted/20 px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[11px]"
            disabled={isPending || !canGoOlder}
            onClick={handlePrev}
            aria-label="이전 훈련 일지"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전
          </Button>
          <span className="min-w-[4.5rem] text-center text-[11px] font-medium tabular-nums text-foreground">
            {pageLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[11px]"
            disabled={isPending || !canGoNewer}
            onClick={handleNext}
            aria-label={pageIndex <= 0 ? '새 훈련 일지' : '다음 훈련 일지'}
          >
            {pageIndex <= 0 && !draftMode ? '새 일지' : '다음'}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-muted-foreground">훈련 날짜</p>
            {!draftMode && current ? (
              <button
                type="button"
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={startNewJournal}
              >
                <Plus className="h-3 w-3" />
                새 일지
              </button>
            ) : null}
          </div>
          <KoreanDatePicker
            value={trainingDate}
            onChange={setTrainingDate}
            compact
            className="w-full"
          />
        </div>

        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={'오늘 훈련 내용을 일지처럼 적어 주세요.\n예: 워밍업 2km → 인터벌 400m x 6 → 쿨다운'}
          rows={7}
          className="min-h-[9.5rem] resize-none text-xs leading-relaxed"
        />

        <div className="flex items-center justify-between gap-1.5">
          {current ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              삭제
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            disabled={isPending || !body.trim()}
            onClick={handleSave}
          >
            {current ? '수정 저장' : '일지 저장'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
