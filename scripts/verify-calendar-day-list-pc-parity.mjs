/**
 * 캘린더 일자 회원 목록 — PC/모바일 동일 레이아웃 클래스 검증
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const panel = readFileSync(
  join(root, 'app/dashboard/calendar/month-day-panel.tsx'),
  'utf8',
)
const memo = readFileSync(
  join(root, 'app/dashboard/calendar/month-memo-input.tsx'),
  'utf8',
)

assert.match(panel, /px-4 py-2/)
assert.match(panel, /px-4 py-3/)
assert.match(panel, /text-sm font-medium/)
assert.match(panel, /개 일정/)
assert.match(panel, /더블클릭으로 이름·시간 수정/)
assert.match(panel, /mt-0\.5 block text-xs text-muted-foreground/)
assert.doesNotMatch(panel, /md:hidden/)
assert.doesNotMatch(panel, /items-center gap-1\.5 px-2\.5 py-1/)
assert.doesNotMatch(panel, /instructorName !== '—' && \(\s*<span className="font-normal text-muted-foreground md:hidden"/)

assert.match(memo, /h-11 border-dashed/)
assert.match(memo, /px-3 pb-\[max\(0\.75rem/)
assert.doesNotMatch(memo, /h-9 border-dashed/)

console.log('All calendar day-list PC-parity checks passed')
