/**
 * §13 랭킹 포털 가드 검증
 * node scripts/verify-ranking-portal-guards.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rankingsSource = readFileSync(
  join(root, 'components/dashboard/member-running-league-rankings.tsx'),
  'utf8',
)
const guardsSource = readFileSync(
  join(root, 'lib/running-league/ranking-portal-guards.ts'),
  'utf8',
)

assert.match(guardsSource, /RANKING_TOP_DISPLAY_COUNT = 10/)
assert.match(guardsSource, /RANKING_PORTAL_MUST_KEEP/)
assert.match(guardsSource, /genderFilter: true/)
assert.match(guardsSource, /fullRankingDialog: true/)

assert.match(rankingsSource, /TOP_DISPLAY_COUNT = RANKING_TOP_DISPLAY_COUNT/)
assert.match(rankingsSource, /slice\(0, TOP_DISPLAY_COUNT\)/)
assert.match(rankingsSource, /formatRankingFullViewButtonLabel/)
assert.match(rankingsSource, /FullRankingDialog/)
assert.match(rankingsSource, /InlineRankingFilterStrip/)
assert.match(rankingsSource, /GenderFilterTabs/)
assert.match(rankingsSource, /genderFilter={genderFilter}/)
assert.match(rankingsSource, /onGenderFilterChange={setGenderFilter}/)
assert.match(rankingsSource, /buildFilteredPortalRankings\(rankingBundle, genderFilter\)/)
assert.match(rankingsSource, /PB 등록\/수정/)
assert.match(rankingsSource, /오늘 러닝 기록 추가/)
assert.match(rankingsSource, /MemberRunningPbDialog/)
assert.match(rankingsSource, /MemberMileageLogDialog/)
assert.match(rankingsSource, /formatRankingMemberName/)
assert.match(rankingsSource, /MyRankSeparator/)
assert.match(rankingsSource, /selectedMemberId === row\.memberId/)
assert.match(rankingsSource, /buildFilteredPortalRankings/)
assert.match(rankingsSource, /lg:max-w-2xl/)
assert.match(rankingsSource, /overflow-x-hidden/)

console.log('[verify-ranking-portal-guards] OK')
