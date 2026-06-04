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

type CalendarSelectionContextValue = {
  selectedIds: ReadonlySet<string>
  count: number
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  clear: () => void
  registerDeleteSelected: (handler: (() => void) | null) => void
  runDeleteSelected: () => void
  isDeleting: boolean
  setIsDeleting: (value: boolean) => void
}

const CalendarSelectionContext = createContext<CalendarSelectionContextValue | null>(
  null,
)

export function CalendarSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const deleteSelectedRef = useRef<(() => void) | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  )

  const registerDeleteSelected = useCallback((handler: (() => void) | null) => {
    deleteSelectedRef.current = handler
  }, [])

  const runDeleteSelected = useCallback(() => {
    deleteSelectedRef.current?.()
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
