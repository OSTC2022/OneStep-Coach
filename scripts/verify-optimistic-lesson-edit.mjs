/**
 * 빠른 등록(optimistic) 직후 수정 시 실제 ID 대기 로직 검증
 */

import assert from 'node:assert/strict'

function isOptimisticLessonId(id) {
  return typeof id === 'string' && id.startsWith('optimistic-')
}

async function waitForPersistedLesson(lesson, { pending, idMap, lessons }) {
  if (!isOptimisticLessonId(lesson.id)) {
    return lessons.find((item) => item.id === lesson.id) ?? lesson
  }
  const pendingPromise = pending.get(lesson.id)
  if (pendingPromise) return pendingPromise
  const realId = idMap.get(lesson.id)
  if (realId) return lessons.find((item) => item.id === realId) ?? null
  return null
}

assert.equal(isOptimisticLessonId('optimistic-abc'), true)
assert.equal(isOptimisticLessonId('real-uuid'), false)

const tempId = 'optimistic-1'
const real = { id: 'real-1', title: '연경모(축구)' }
const pending = new Map()
const idMap = new Map()
const lessons = [{ id: tempId, title: '연경모(축구)' }]

let resolveCreate
const createPromise = new Promise((resolve) => {
  resolveCreate = resolve
})
pending.set(tempId, createPromise)

const waiting = waitForPersistedLesson(
  { id: tempId },
  { pending, idMap, lessons },
)

resolveCreate(real)
const persisted = await waiting
assert.equal(persisted?.id, 'real-1')

pending.delete(tempId)
idMap.set(tempId, 'real-1')
lessons.length = 0
lessons.push(real)

const afterDone = await waitForPersistedLesson(
  { id: tempId },
  { pending, idMap, lessons },
)
assert.equal(afterDone?.id, 'real-1')

const missing = await waitForPersistedLesson(
  { id: 'optimistic-missing' },
  { pending, idMap, lessons },
)
assert.equal(missing, null)

console.log('All optimistic lesson edit checks passed')
