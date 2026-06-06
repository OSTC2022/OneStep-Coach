'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Lesson } from '@/lib/types'

type CalendarSelectionContextValue = {
  selectedIds: ReadonlySet<string>
  count: number
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  clear: () => void
  registerDeleteSelected: (handler: (() => void) | null) => void
  runDeleteSelected: () => void
  registerLessonSaved: (handler: ((lesson: Lesson) => void) | null) => void
  notifyLessonSaved: (lesson: Lesson) => void
  lessonFormOpen: boolean
  setLessonFormOpen: (open: boolean) => void
  isDeleting: boolean
  setIsDeleting: (value: boolean) => void
}

const CalendarSelectionContext = createContext<CalendarSelectionContextValue | null>(
  null,
)

export function CalendarSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const deleteSelectedRef = useRef<(() => void) | null>(null)
  const lessonSavedRef = useRef<((lesson: Lesson) => void) | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [lessonFormOpen, setLessonFormOpen] = useState(false)

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  const isSelected = useCallback(
    (id: string) => selectedIdsRef.current.has(id),
    [],
  )

  const registerDeleteSelected = useCallback((handler: (() => void) | null) => {
    deleteSelectedRef.current = handler
  }, [])

  const runDeleteSelected = useCallback(() => {
    deleteSelectedRef.current?.()
  }, [])

  const registerLessonSaved = useCallback(
    (handler: ((lesson: Lesson) => void) | null) => {
      lessonSavedRef.current = handler
    },
    [],
  )

  const notifyLessonSaved = useCallback((lesson: Lesson) => {
    lessonSavedRef.current?.(lesson)
  }, [])

  const value = useMemo(
    () => ({
      selectedIds,
      count: selectedIds.size,
      isSelected,
      toggle,
      clear,
      registerDeleteSelected,
      runDeleteSelected,
      registerLessonSaved,
      notifyLessonSaved,
      lessonFormOpen,
      setLessonFormOpen,
      isDeleting,
      setIsDeleting,
    }),
    [
      selectedIds,
      isSelected,
      toggle,
      clear,
      registerDeleteSelected,
      runDeleteSelected,
      registerLessonSaved,
      notifyLessonSaved,
      lessonFormOpen,
      isDeleting,
    ],
  )

  return (
    <CalendarSelectionContext.Provider value={value}>
      {children}
    </CalendarSelectionContext.Provider>
  )
}

export function useCalendarSelection() {
  const ctx = useContext(CalendarSelectionContext)
  if (!ctx) {
    throw new Error('useCalendarSelection must be used within CalendarSelectionProvider')
  }
  return ctx
}
