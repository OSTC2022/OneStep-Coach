'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createStaffMemoNote,
  deleteStaffMemoNote,
  listStaffMemoNotes,
  updateStaffMemoNote,
  type StaffMemoNote,
} from '@/lib/actions/staff-memo-notes'
import {
  listMembersForPicker,
  searchMembersForPickerCached,
  type MemberPickerOption,
} from '@/lib/actions/members'
import {
  filterSortMembersForPicker,
  matchKoreanNameSearch,
} from '@/lib/korean-search'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const OPEN_STORAGE_KEY = 'lesson-status:staff-memo-open'

interface LessonStatusMemoBoardProps {
  initialNotes?: StaffMemoNote[]
  migrationWarning?: string
  triggerClassName?: string
}

function formatNoteTime(value: string) {
  try {
    return format(parseISO(value), 'M/d HH:mm', { locale: ko })
  } catch {
    return ''
  }
}

export function LessonStatusMemoBoard({
  initialNotes = [],
  migrationWarning,
  triggerClassName,
}: LessonStatusMemoBoardProps) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<StaffMemoNote[]>(initialNotes)
  const [search, setSearch] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [bodyInput, setBodyInput] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [memberCatalog, setMemberCatalog] = useState<MemberPickerOption[]>([])
  const [remoteMatches, setRemoteMatches] = useState<MemberPickerOption[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_STORAGE_KEY) === '1') {
        setOpen(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  useEffect(() => {
    setNotes(initialNotes)
  }, [initialNotes])

  useEffect(() => {
    if (!open || catalogLoaded) return
    let cancelled = false
    void listMembersForPicker(300)
      .then((rows) => {
        if (!cancelled) {
          setMemberCatalog(rows)
          setCatalogLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, catalogLoaded])

  useEffect(() => {
    const q = nameInput.trim()
    if (q.length < 1) {
      setRemoteMatches([])
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void searchMembersForPickerCached(q)
        .then((rows) => {
          if (cancelled) return
          setRemoteMatches(rows)
          setIsSearching(false)
        })
        .catch(() => {
          if (!cancelled) setIsSearching(false)
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [nameInput])

  const suggestions = useMemo(() => {
    const q = nameInput.trim()
    if (!q) return []

    const local = filterSortMembersForPicker(memberCatalog, q, { limit: 10 })
    const merged = new Map<string, MemberPickerOption>()
    for (const member of local) merged.set(member.id, member)
    for (const member of remoteMatches) {
      if (!merged.has(member.id)) merged.set(member.id, member)
    }
    return filterSortMembersForPicker(Array.from(merged.values()), q, {
      limit: 10,
    })
  }, [memberCatalog, remoteMatches, nameInput])

  const filteredNotes = useMemo(() => {
    const q = search.trim()
    if (!q) return notes
    return notes.filter(
      (note) =>
        matchKoreanNameSearch(note.member_name, q) ||
        note.body.toLowerCase().includes(q.toLowerCase()),
    )
  }, [notes, search])

  function resetForm() {
    setEditingId(null)
    setNameInput('')
    setBodyInput('')
    setSelectedMemberId(null)
    setRemoteMatches([])
    setSearchOpen(false)
  }

  function startEdit(note: StaffMemoNote) {
    setEditingId(note.id)
    setNameInput(note.member_name)
    setBodyInput(note.body)
    setSelectedMemberId(note.member_id)
    setSearchOpen(false)
  }

  function pickMember(member: MemberPickerOption) {
    setSelectedMemberId(member.id)
    setNameInput(member.name)
    setSearchOpen(false)
  }

  function handleSubmit() {
    const memberName = nameInput.trim()
    const body = bodyInput.trim()
    if (!memberName) {
      toast.error('이름을 입력해주세요.')
      return
    }
    if (!body) {
      toast.error('메모 내용을 입력해주세요.')
      return
    }

    startTransition(async () => {
      if (editingId) {
        const result = await updateStaffMemoNote(editingId, {
          memberId: selectedMemberId,
          memberName,
          body,
        })
        if (result.error) {
          toast.error('메모 수정 실패', { description: result.error })
          return
        }
        if (result.data) {
          setNotes((prev) =>
            prev
              .map((item) => (item.id === result.data!.id ? result.data! : item))
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
          )
        }
        toast.success('메모를 수정했습니다.')
      } else {
        const result = await createStaffMemoNote({
          memberId: selectedMemberId,
          memberName,
          body,
        })
        if (result.error) {
          toast.error('메모 등록 실패', { description: result.error })
          return
        }
        if (result.data) {
          setNotes((prev) => [result.data!, ...prev])
        }
        toast.success('알림장에 추가했습니다.')
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
      setNotes((prev) => prev.filter((item) => item.id !== id))
      if (editingId === id) resetForm()
      toast.success('메모를 삭제했습니다.')
    })
  }

  function refreshNotes() {
    startTransition(async () => {
      const result = await listStaffMemoNotes()
      setNotes(result.data)
      if (result.warning) {
        toast.warning('DB 마이그레이션 필요', { description: result.warning })
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) refreshNotes()
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 text-xs', triggerClassName)}
        >
          <NotebookPen className="mr-1 h-3.5 w-3.5" aria-hidden />
          알림장
          {notes.length > 0 ? (
            <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] tabular-nums text-foreground">
              {notes.length}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[min(88vh,640px)] w-[min(100vw-1.5rem,420px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        opaqueBackdrop
      >
        <DialogHeader className="shrink-0 border-b border-border/70 bg-muted/25 px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4 text-primary" aria-hidden />
            스태프 알림장
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            초성으로 이름 검색 · 예: ㅇㅎ → 이현
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {migrationWarning ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
              {migrationWarning}
            </p>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="메모 검색 (초성 가능)"
              className="h-9 pl-8 text-sm"
            />
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-border/80 bg-muted/15 p-2.5">
            <div className="relative">
              <Input
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value)
                  setSelectedMemberId(null)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="이름"
                className="h-9 text-sm"
              />
              {searchOpen && nameInput.trim() ? (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {isSearching && suggestions.length === 0 && !catalogLoaded ? (
                    <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      검색중…
                    </p>
                  ) : null}
                  {suggestions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => pickMember(member)}
                    >
                      <span className="font-medium">{member.name}</span>
                      {member.sport ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {member.sport}
                        </span>
                      ) : null}
                    </button>
                  ))}
                  {!isSearching && suggestions.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      등록 회원이 없어도 “{nameInput.trim()}” 이름으로 저장됩니다.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Textarea
              value={bodyInput}
              onChange={(e) => setBodyInput(e.target.value)}
              placeholder="내용"
              className="min-h-[80px] resize-none text-sm"
            />
            <div className="flex items-center justify-end gap-1.5">
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={resetForm}
                  disabled={isPending}
                >
                  취소
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : editingId ? (
                  <Pencil className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {editingId ? '수정' : '추가'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredNotes.length === 0 ? (
              <p className="px-1 py-8 text-center text-xs text-muted-foreground">
                {search.trim()
                  ? '검색 결과가 없습니다.'
                  : '아직 메모가 없습니다. 위쪽에서 추가하세요.'}
              </p>
            ) : (
              filteredNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-md border border-border/70 bg-background/60 px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold text-foreground">
                          {note.member_name}
                        </span>
                        <span className="text-muted-foreground"> — </span>
                        <span className="text-foreground/90">{note.body}</span>
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatNoteTime(note.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(note)}
                        disabled={isPending}
                        aria-label="메모 수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(note.id)}
                        disabled={isPending}
                        aria-label="메모 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-border/60 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={refreshNotes}
            disabled={isPending}
          >
            새로고침
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
