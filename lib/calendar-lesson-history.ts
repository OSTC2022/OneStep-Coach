'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createLesson, deleteLesson, updateLesson } from '@/lib/actions/lessons'
import { resolveLessonTitle } from '@/lib/calendar-utils'
import type { Lesson, LessonFormData } from '@/lib/types'

const MAX_UNDO_STEPS = 50

type HistoryCommand = {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

function cloneLesson(lesson: Lesson): Lesson {
  return structuredClone(lesson)
}

function lessonToFormData(lesson: Lesson): LessonFormData {
  return {
    member_id: lesson.member_id,
    title: lesson.title ?? resolveLessonTitle(lesson),
    instructor_id: lesson.instructor_id || undefined,
    session_package_id: lesson.session_package_id || undefined,
    lesson_date: lesson.lesson_date,
    start_time: lesson.start_time || undefined,
    end_time: lesson.end_time || undefined,
    lesson_type: lesson.lesson_type,
    content: lesson.content || undefined,
    special_note: lesson.special_note || undefined,
    attendance_status: lesson.attendance_status,
  }
}

function lessonToUpdatePatch(lesson: Lesson): Partial<LessonFormData> {
  return lessonToFormData(lesson)
}

function lessonChangeKey(lesson: Lesson) {
  return [
    lesson.id,
    lesson.lesson_date,
    lesson.start_time,
    lesson.end_time,
    lesson.member_id,
    lesson.title,
    lesson.content,
    lesson.instructor_id,
    lesson.lesson_type,
  ].join('|')
}

export function useCalendarLessonHistory(
  setLessons: React.Dispatch<React.SetStateAction<Lesson[]>>,
) {
  const undoStack = useRef<HistoryCommand[]>([])
  const redoStack = useRef<HistoryCommand[]>([])
  const applyingRef = useRef(false)
  const [stackState, setStackState] = useState({
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
  })

  const syncStacks = useCallback(() => {
    setStackState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      undoCount: undoStack.current.length,
      redoCount: redoStack.current.length,
    })
  }, [])

  const applyLocal = useCallback(
    (updater: (prev: Lesson[]) => Lesson[]) => {
      setLessons(updater)
    },
    [setLessons],
  )

  const push = useCallback(
    (command: HistoryCommand) => {
      if (applyingRef.current) return

      undoStack.current.push(command)
      if (undoStack.current.length > MAX_UNDO_STEPS) {
        undoStack.current.shift()
      }
      redoStack.current = []
      syncStacks()
    },
    [syncStacks],
  )

  const clear = useCallback(() => {
    undoStack.current = []
    redoStack.current = []
    syncStacks()
  }, [syncStacks])

  const pushLessonUpdate = useCallback(
    (before: Lesson, after: Lesson) => {
      if (lessonChangeKey(before) === lessonChangeKey(after)) return

      const beforeSnap = cloneLesson(before)
      const afterSnap = cloneLesson(after)

      push({
        undo: async () => {
          const result = await updateLesson(
            beforeSnap.id,
            lessonToUpdatePatch(beforeSnap),
          )
          if (result.error) {
            toast.error('실행 취소 실패', { description: result.error })
            return
          }
          const next = result.data ?? beforeSnap
          applyLocal((prev) =>
            prev.map((item) => (item.id === beforeSnap.id ? next : item)),
          )
        },
        redo: async () => {
          const result = await updateLesson(
            afterSnap.id,
            lessonToUpdatePatch(afterSnap),
          )
          if (result.error) {
            toast.error('다시 실행 실패', { description: result.error })
            return
          }
          const next = result.data ?? afterSnap
          applyLocal((prev) =>
            prev.map((item) => (item.id === afterSnap.id ? next : item)),
          )
        },
      })
    },
    [push, applyLocal],
  )

  const pushLessonCreate = useCallback(
    (lesson: Lesson) => {
      const snap = cloneLesson(lesson)

      push({
        undo: async () => {
          const result = await deleteLesson(snap.id)
          if (result.error) {
            toast.error('실행 취소 실패', { description: result.error })
            return
          }
          applyLocal((prev) => prev.filter((item) => item.id !== snap.id))
        },
        redo: async () => {
          const result = await createLesson(lessonToFormData(snap))
          if (result.error) {
            toast.error('다시 실행 실패', { description: result.error })
            return
          }
          if (result.data) {
            applyLocal((prev) => {
              if (prev.some((item) => item.id === result.data!.id)) {
                return prev.map((item) =>
                  item.id === result.data!.id ? result.data! : item,
                )
              }
              return [...prev, result.data!]
            })
          }
        },
      })
    },
    [push, applyLocal],
  )

  const pushLessonDelete = useCallback(
    (lesson: Lesson) => {
      const snap = cloneLesson(lesson)
      let restoredId = snap.id

      push({
        undo: async () => {
          const result = await createLesson(lessonToFormData(snap))
          if (result.error) {
            toast.error('실행 취소 실패', { description: result.error })
            return
          }
          if (result.data) {
            restoredId = result.data.id
            applyLocal((prev) => {
              if (prev.some((item) => item.id === result.data!.id)) return prev
              return [...prev, result.data!]
            })
          }
        },
        redo: async () => {
          const result = await deleteLesson(restoredId)
          if (result.error) {
            toast.error('다시 실행 실패', { description: result.error })
            return
          }
          applyLocal((prev) => prev.filter((item) => item.id !== restoredId))
        },
      })
    },
    [push, applyLocal],
  )

  const pushLessonBulkDelete = useCallback(
    (lessons: Lesson[]) => {
      if (lessons.length === 0) return
      const snaps = lessons.map(cloneLesson)
      const restoredIds: string[] = []

      push({
        undo: async () => {
          restoredIds.length = 0
          for (const lesson of snaps) {
            const result = await createLesson(lessonToFormData(lesson))
            if (result.error) {
              toast.error('실행 취소 실패', { description: result.error })
              continue
            }
            if (result.data) {
              restoredIds.push(result.data.id)
              const created = result.data
              applyLocal((prev) => {
                if (prev.some((item) => item.id === created.id)) return prev
                return [...prev, created]
              })
            }
          }
        },
        redo: async () => {
          const ids =
            restoredIds.length > 0
              ? [...restoredIds]
              : snaps.map((lesson) => lesson.id)
          for (const id of ids) {
            const result = await deleteLesson(id)
            if (result.error) {
              toast.error('다시 실행 실패', { description: result.error })
            }
          }
          applyLocal((prev) => prev.filter((item) => !ids.includes(item.id)))
        },
      })
    },
    [push, applyLocal],
  )

  const undo = useCallback(async () => {
    const command = undoStack.current.pop()
    if (!command) return

    applyingRef.current = true
    try {
      await command.undo()
      redoStack.current.push(command)
      const remaining = undoStack.current.length
      toast.message(
        remaining > 0
          ? `실행 취소 (${remaining}단계 더 되돌릴 수 있음)`
          : '실행 취소',
      )
    } finally {
      applyingRef.current = false
      syncStacks()
    }
  }, [syncStacks])

  const redo = useCallback(async () => {
    const command = redoStack.current.pop()
    if (!command) return

    applyingRef.current = true
    try {
      await command.redo()
      undoStack.current.push(command)
      const remaining = redoStack.current.length
      toast.message(
        remaining > 0
          ? `다시 실행 (${remaining}단계 더 복원 가능)`
          : '다시 실행',
      )
    } finally {
      applyingRef.current = false
      syncStacks()
    }
  }, [syncStacks])

  return {
    pushCommand: push,
    pushLessonUpdate,
    pushLessonCreate,
    pushLessonDelete,
    pushLessonBulkDelete,
    undo,
    redo,
    clear,
    canUndo: stackState.canUndo,
    canRedo: stackState.canRedo,
    undoCount: stackState.undoCount,
    redoCount: stackState.redoCount,
  }
}
