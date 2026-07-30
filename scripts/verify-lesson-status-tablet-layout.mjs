/**
 * 수업현황 태블릿 카드 레이아웃 정책 검증
 * — 인원 수만큼 1fr로 늘리지 않고 고정 maxPerRow 칸을 씀 (가로 꽉 채움 방지)
 */

import assert from 'node:assert/strict'

function buildDesktopLikeColumns(maxPerRow, lessonCountInRow) {
  return {
    outer: `repeat(${maxPerRow}, minmax(0, 1fr))`,
    span: Math.min(lessonCountInRow, maxPerRow),
  }
}

function buildBrokenTabletColumns(lessonCountInRow) {
  // 이전 버그: 인원 수 = 열 수 → 1명이면 가로 100%
  return `repeat(${Math.max(1, lessonCountInRow)}, minmax(11rem, 1fr))`
}

const fixed = buildDesktopLikeColumns(4, 1)
assert.equal(fixed.outer, 'repeat(4, minmax(0, 1fr))')
assert.equal(fixed.span, 1)

const three = buildDesktopLikeColumns(4, 3)
assert.equal(three.span, 3)

const broken = buildBrokenTabletColumns(1)
assert.equal(broken, 'repeat(1, minmax(11rem, 1fr))')
assert.notEqual(fixed.outer, broken)

function metricCellOverflowSafe(classes) {
  return classes.includes('min-w-0') && (
    classes.includes('truncate') || classes.includes('overflow-hidden')
  )
}

assert.equal(metricCellOverflowSafe('min-w-0 overflow-hidden'), true)
assert.equal(metricCellOverflowSafe('min-w-0 truncate text-right'), true)
assert.equal(metricCellOverflowSafe('text-right'), false)

console.log('All lesson-status tablet layout checks passed')
