'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCalendarSelection } from '@/components/dashboard/calendar-selection-context'
import { getInstructorForCurrentUser, getInstructors } from '@/lib/actions/instructors'
import { getMembers } from '@/lib/actions/members'
import type { LessonDraft } from '@/lib/calendar-utils'
import type { Instructor, Lesson, UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const LessonCreateDialog = dynamic(
  () =>
    import('@/app/dashboard/calendar/lesson-create-dialog').then((m) => ({
      default: m.LessonCreateDialog,
    })),
  { ssr: false },
)

interface MemberOption {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

function getDefaultLessonDraft(): LessonDraft {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const hour = now.getHours()
  const startTime = `${String(hour).padStart(2, '0')}:00`
  const endHour = Math.min(hour + 1, 23)
  const endTime =
    hour >= 23 ? '23:59' : `${String(endHour).padStart(2, '0')}:00`

  return { date, startTime, endTime }
}

interface LessonScheduleFabProps {
  role: UserRole
}

export function LessonScheduleFab({ role }: LessonScheduleFabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    count: selectionCount,
    runDeleteSelected,
    notifyLessonSaved,
    lessonFormOpen,
    isDeleting,
  } = useCalendarSelection()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<LessonDraft | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [defaultInstructorId, setDefaultInstructorId] = useState<string | null>(
    null,
  )
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const loadInFlightRef = useRef(false)

  const canSchedule = role === 'admin' || role === 'instructor'
  const onCalendarPage = pathname?.startsWith('/dashboard/calendar') ?? false
  const showSelectionDelete = onCalendarPage && selectionCount > 0
  const hideScheduleFab = open || lessonFormOpen

  const loadFormData = useCallback(async (): Promise<boolean> => {
    if (dataReady) return true
    if (loadInFlightRef.current) return false

    loadInFlightRef.current = true
    setIsLoadingData(true)
    try {
      const [membersResult, instructorList, currentInstructor] =
        await Promise.all([
          getMembers({ isActive: true, limit: 30 }),
          getInstructors({ isActive: true, picker: true }),
          getInstructorForCurrentUser(),
        ])

      setMembers(
        membersResult.data.map((m) => ({
          id: m.id,
          name: m.name,
          sport: m.sport,
          age: m.age,
          birth_date: m.birth_date,
        })),
      )
      setInstructors(instructorList)
      setDefaultInstructorId(currentInstructor?.id ?? null)
      setDataReady(true)
      return true
    } catch (error) {
      console.error('[calendar] fab form data load error', error)
      toast.error('일정 등록 데이터를 불러오지 못했습니다.')
      return false
    } finally {
      loadInFlightRef.current = false
      setIsLoadingData(false)
    }
  }, [dataReady])

  async function handleOpen() {
    if (isLoadingData) return
    const ready = await loadFormData()
    if (!ready) return
    setDraft(getDefaultLessonDraft())
    setOpen(true)
  }

  function handleSaved(lesson: Lesson) {
    setOpen(false)
    setDraft(null)
    if (onCalendarPage) {
      notifyLessonSaved(lesson)
    } else {
      router.refresh()
    }
    toast.success('일정이 등록되었습니다.', {
      description: `${lesson.lesson_date} ${lesson.start_time?.slice(0, 5) ?? ''}`.trim(),
    })
  }

  if (!canSchedule) {
    return null
  }

  return (
    <>
      {showSelectionDelete && (
        <button
          type="button"
          aria-label={`선택 ${selectionCount}개 삭제`}
          title={`선택 ${selectionCount}개 삭제`}
          disabled={isDeleting}
          onClick={() => runDeleteSelected()}
          className={cn(
            'fixed z-[60] flex h-14 w-14 touch-manipulation select-none items-center justify-center rounded-full',
            'bg-destructive text-destructive-foreground shadow-lg',
            'active:scale-95 active:opacity-90 md:transition-transform md:hover:scale-105',
            'bottom-6 right-24 md:bottom-8 md:right-28',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isDeleting && 'pointer-events-none opacity-70',
          )}
        >
          {isDeleting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Trash2 className="h-6 w-6" strokeWidth={2.25} />
          )}
        </button>
      )}

      {!hideScheduleFab && (
        <button
          type="button"
          aria-label="일정 등록"
          onClick={() => void handleOpen()}
          disabled={isLoadingData}
          className={cn(
            'fixed z-[60] flex h-14 w-14 touch-manipulation select-none items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            'active:scale-95 active:opacity-90 md:transition-transform md:hover:scale-105',
            'bottom-6 right-6 md:bottom-8 md:right-8',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          {isLoadingData ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          )}
        </button>
      )}

      {open && (
        <LessonCreateDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setDraft(null)
          }}
          draft={draft}
          members={members}
          instructors={instructors}
          defaultInstructorId={defaultInstructorId}
          onSaved={handleSaved}
          variant="dialog"
        />
      )}
    </>
  )
}
