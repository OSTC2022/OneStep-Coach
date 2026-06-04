import type { CalendarView } from '@/lib/calendar-utils'

export type CalendarShortcutAction = CalendarView | 'today'

function isSpaceKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.closest('[role="listbox"]')) return true
  const combobox = target.closest('[role="combobox"]')
  if (combobox?.getAttribute('aria-expanded') === 'true') return true
  return false
}

export function matchCalendarShortcut(e: KeyboardEvent): CalendarShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || e.altKey) return null

  if (!e.shiftKey) {
    if (e.key === '1') return 'day'
    if (e.key === '2') return 'week'
    if (e.key === '3') return 'month'
    if (isSpaceKey(e)) return 'today'
  }

  // Windows 한글 IME가 Ctrl+Space를 가로채는 경우가 많아 Shift 조합도 허용
  if (e.shiftKey && isSpaceKey(e)) return 'today'

  return null
}

/** Ctrl+Z 실행 취소, Ctrl+Y / Ctrl+Shift+Z 다시 실행 */
export function matchCalendarUndoRedo(
  e: KeyboardEvent,
): 'undo' | 'redo' | null {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || e.altKey) return null

  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) return 'undo'
  if (key === 'y' || (key === 'z' && e.shiftKey)) return 'redo'
  return null
}
