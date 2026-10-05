'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createStaffMemoNote,
  deleteStaffMemoNote,
  listStaffMemoNotesForMember,
  updateStaffMemoNote,
  type StaffMemoNote,
} from '@/lib/actions/staff-memo-notes'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type MemberStaffMemoButtonProps = {
  memberId: string
  memberName: string
  initialNotes?: StaffMemoNote[]
  compact?: boolean
  className?: string
  onNotesChange?: (notes: StaffMemoNote[]) => void
}

function formatNoteTime(value: string) {
  try {
    return format(parseISO(value), 'M/d HH:mm', { locale: ko })
  } catch {
    return ''
  }
}

export function MemberStaffMemoButton({
  memberId,
  memberName,
  initialNotes = [],
  compact = false,
  className,
  onNotesChange,
}: MemberStaffMemoButtonProps) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<StaffMemoNote[]>(() =>
    [...initialNotes].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  )
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNotes(
      [...initialNotes].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    )
  }, [initialNotes, memberId])

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [open, notes])

  function replaceNotes(next: StaffMemoNote[]) {
    const ordered = [...next].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    setNotes(ordered)
    onNotesChange?.(ordered)
  }

  function refreshNotes() {
    startTransition(async () => {
      const result = await listStaffMemoNotesForMember(memberId)
      replaceNotes(result.data)
      if (result.warning) {
        toast.warning('DB 마이그레이션 필요', { description: result.warning })
      }
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setBody('')
      setEditingId(null)
      return
    }
    refreshNotes()
  }

  function startEdit(note: StaffMemoNote) {
    setEditingId(note.id)
    setBody(note.body)
  }

  function resetForm() {
    setEditingId(null)
    setBody('')
  }

  function handleSave() {
    const trimmed = body.trim()
    if (!trimmed) {
      toast.error('메모 내용을 입력해주세요.')
      return
    }

    startTransition(async () => {
      if (editingId) {
        const result = await updateStaffMemoNote(editingId, {
          memberId,
          memberName,
          body: trimmed,
        })
        if (result.error) {
          toast.error('메모 수정 실패', { description: result.error })
          return
        }
        if (result.data) {
          replaceNotes(
            notes.map((item) =>
              item.id === result.data!.id ? result.data! : item,
            ),
          )
        }
        toast.success('메모를 수정했습니다.')
      } else {
        const result = await createStaffMemoNote({
          memberId,
          memberName,
          body: trimmed,
        })
        if (result.error) {
          toast.error('메모 등록 실패', { description: result.error })
          return
        }
        if (result.data) {
          replaceNotes([...notes, result.data])
        }
        toast.success('알림장에 저장했습니다.')
      }
      resetForm()
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('이 메모를 삭제할까요?')) return
    startTransition(async () => {
      const result = await deleteStaffMemoNote(id)
      if (result.error) {
        toast.error('메모 삭제 실패', { description: result.error })
        return
      }
      replaceNotes(notes.filter((item) => item.id !== id))
      if (editingId === id) resetForm()
      toast.success('메모를 삭제했습니다.')
    })
  }

  const hasNotes = notes.length > 0

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex shrink-0 items-center justify-center rounded border transition-colors',
            compact ? 'h-4 w-4' : 'h-5 w-5',
            hasNotes
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              : 'border-dashed border-muted-foreground/40 bg-muted/20 text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground',
            className,
          )}
          title={
            hasNotes
              ? `${memberName} 알림장 ${notes.length}건`
              : `${memberName} 알림장 메모`
          }
          aria-label={
            hasNotes
              ? `${memberName} 알림장 ${notes.length}건`
              : `${memberName} 알림장 메모 작성`
          }
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <NotebookPen className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
          {hasNotes ? (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[200] w-64 space-y-2 p-2.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="truncate text-[11px] font-semibold text-foreground">
            {memberName} 알림장
          </p>
          {isPending ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div ref={listRef} className="max-h-40 space-y-1.5 overflow-y-auto">
          {notes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/70 px-2 py-3 text-center text-[11px] text-muted-foreground">
              아직 메모가 없습니다
            </p>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5"
              >
                <p className="whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
                  {note.body}
                </p>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-[9px] text-muted-foreground">
                    {formatNoteTime(note.updated_at)}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={isPending}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      aria-label="메모 수정"
                      onClick={() => startEdit(note)}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="메모 삭제"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={editingId ? '메모 수정…' : '메모 추가…'}
            rows={2}
            className="min-h-[3.25rem] resize-none text-xs"
          />
          <div className="flex items-center justify-end gap-1.5">
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={isPending}
                onClick={resetForm}
              >
                취소
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              disabled={isPending || !body.trim()}
              onClick={handleSave}
            >
              {editingId ? '수정' : '저장'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
