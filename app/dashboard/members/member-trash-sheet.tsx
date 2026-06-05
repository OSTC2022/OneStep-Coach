'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getMembers,
  restoreMember,
  permanentlyDeleteMember,
} from '@/lib/actions/members'
import { Member } from '@/types/database'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
import { toast } from 'sonner'
import { Trash2, RotateCcw, X } from 'lucide-react'

interface MemberTrashSheetProps {
  initialCount: number
  recentTrashItems?: Member[]
  onTrashCountChange?: (count: number) => void
}

function formatDeletedAt(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MemberTrashSheet({
  initialCount,
  recentTrashItems = [],
  onTrashCountChange,
}: MemberTrashSheetProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [trashCount, setTrashCount] = useState(initialCount)
  const [items, setItems] = useState<Member[]>([])
  const [trashEnabled, setTrashEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [permanentTarget, setPermanentTarget] = useState<Member | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function mergeTrashItems(serverItems: Member[]) {
    const merged = new Map<string, Member>()
    for (const item of [...recentTrashItems, ...serverItems]) {
      merged.set(item.id, { ...item, deleted_at: item.deleted_at ?? new Date().toISOString() })
    }
    return [...merged.values()].sort((a, b) => {
      const aTime = a.deleted_at ? new Date(a.deleted_at).getTime() : 0
      const bTime = b.deleted_at ? new Date(b.deleted_at).getTime() : 0
      return bTime - aTime
    })
  }

  async function loadTrash() {
    setLoading(true)
    try {
      const { data, count, trashEnabled: enabled } = await getMembers({
        trash: true,
        orderBy: 'deleted_at',
        orderAsc: false,
        limit: 100,
      })
      setTrashEnabled(enabled)
      const merged = mergeTrashItems(data)
      setItems(merged)
      setTrashCount(enabled ? count : merged.length)
      onTrashCountChange?.(enabled ? count : merged.length)
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      await loadTrash()
    }
  }

  async function handleRestore(member: Member) {
    setBusyId(member.id)
    const result = await restoreMember(member.id)
    setBusyId(null)

    if (result.error) {
      toast.error('복구 실패', { description: result.error })
      return
    }

    setItems((prev) => prev.filter((m) => m.id !== member.id))
    const nextCount = Math.max(0, trashCount - 1)
    setTrashCount(nextCount)
    onTrashCountChange?.(nextCount)
    toast.success(`${member.name} 회원이 복구되었습니다.`)
    router.refresh()
  }

  async function handlePermanentDelete() {
    if (!permanentTarget) return
    const member = permanentTarget
    setBusyId(member.id)

    const result = await permanentlyDeleteMember(member.id)
    setBusyId(null)
    setPermanentTarget(null)

    if (result.error) {
      toast.error('영구 삭제 실패', { description: result.error })
      return
    }

    setItems((prev) => prev.filter((m) => m.id !== member.id))
    const nextCount = Math.max(0, trashCount - 1)
    setTrashCount(nextCount)
    onTrashCountChange?.(nextCount)
    toast.success(`${member.name} 회원이 영구 삭제되었습니다.`)
    router.refresh()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => void handleOpenChange(v)}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative shrink-0"
            title="휴지통"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            {trashCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {trashCount > 99 ? '99+' : trashCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              휴지통
            </SheetTitle>
            <SheetDescription>
              삭제한 회원이 여기에 보관됩니다. 복구하거나 영구 삭제할 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                불러오는 중…
              </p>
            ) : !trashEnabled ? (
              <div className="space-y-3 px-1 py-8 text-center text-sm text-muted-foreground">
                <p>휴지통 DB 설정이 필요합니다.</p>
                <p className="text-xs leading-relaxed">
                  Supabase SQL Editor에서{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                    supabase/add-members-deleted-at.sql
                  </code>{' '}
                  을 실행한 뒤 삭제하면 휴지통에 보관됩니다.
                </p>
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                휴지통이 비어 있습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        삭제: {formatDeletedAt(member.deleted_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="복구"
                        disabled={busyId === member.id}
                        onClick={() => void handleRestore(member)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="영구 삭제"
                        disabled={busyId === member.id}
                        onClick={() => setPermanentTarget(member)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={permanentTarget != null}
        onOpenChange={(v) => {
          if (!v) setPermanentTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>영구 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {permanentTarget?.name} 회원을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수
              없으며 모든 관련 데이터가 삭제될 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handlePermanentDelete()}
            >
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
