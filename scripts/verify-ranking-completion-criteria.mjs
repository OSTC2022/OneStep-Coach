/**
 * §14 완료 기준 검증
 * node scripts/verify-ranking-completion-criteria.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const myPage = readFileSync(join(root, 'app/dashboard/my/member-my-page.tsx'), 'utf8')
const rankings = readFileSync(
  join(root, 'components/dashboard/member-running-league-rankings.tsx'),
  'utf8',
)
const charts = readFileSync(join(root, 'components/dashboard/member-ranking-charts.tsx'), 'utf8')
const detail = readFileSync(
  join(root, 'components/dashboard/member-ranking-detail-panel.tsx'),
  'utf8',
)
const gender = readFileSync(join(root, 'lib/running-league/ranking-gender.ts'), 'utf8')
const pbLabels = readFileSync(join(root, 'lib/running-league/pb-distance-labels.ts'), 'utf8')
const rankingView = readFileSync(join(root, 'lib/running-league/ranking-view.ts'), 'utf8')

const criteria = [
  {
    id: 1,
    name: '포털 상단 랭킹 섹션',
    check: () => {
      const titleIdx = myPage.indexOf('내 러닝 포털')
      const rankingsIdx = myPage.indexOf('<MemberRunningLeagueRankings')
      const profileCardIdx = myPage.indexOf('border-primary/20 bg-primary/5')
      assert.ok(titleIdx >= 0 && rankingsIdx > titleIdx, 'rankings after portal title')
      assert.ok(rankingsIdx < profileCardIdx, 'rankings before profile card')
    },
  },
  {
    id: 2,
    name: '포털 통합 레이아웃 (랭킹·그래프·요약)',
    check: () => {
      assert.match(rankings, /portalGraphBody/)
      assert.match(rankings, /RankingPreview/)
      assert.match(rankings, /MemberRankingDetailPanel/)
      assert.match(rankings, /variant="mobile"/)
    },
  },
  {
    id: 3,
    name: '전체/남자/여자 필터',
    check: () => {
      assert.match(gender, /label: '전체'/)
      assert.match(gender, /label: '남자'/)
      assert.match(gender, /label: '여자'/)
      assert.match(gender, /같은 그룹/)
      assert.match(rankings, /GenderFilterTabs/)
      assert.match(rankings, /buildFilteredPortalRankings\(rankingBundle, genderFilter\)/)
    },
  },
  {
    id: 4,
    name: 'PB 5km/10km/Half/Full',
    check: () => {
      assert.match(pbLabels, /'5km'/)
      assert.match(pbLabels, /'10km'/)
      assert.match(pbLabels, /half: 'Half'/)
      assert.match(pbLabels, /full: 'Full'/)
      assert.match(rankings, /PbDistanceTabs/)
    },
  },
  {
    id: 5,
    name: '월 마일리지 랭킹',
    check: () => {
      assert.match(rankingView, /label: '월 마일리지'/)
      assert.match(rankings, /MileageRankingList/)
    },
  },
  {
    id: 6,
    name: '상위 10명 + 전체보기',
    check: () => {
      assert.match(rankings, /TOP_DISPLAY_COUNT/)
      assert.match(rankings, /slice\(0, TOP_DISPLAY_COUNT\)/)
      assert.match(rankings, /formatRankingFullViewButtonLabel/)
      assert.match(rankings, /FullRankingDialog/)
      assert.match(rankings, /onGenderFilterChange={setGenderFilter}/)
    },
  },
  {
    id: 7,
    name: '이름 클릭 → 그래프 강조',
    check: () => {
      assert.match(rankings, /handleMemberSelect/)
      assert.match(rankings, /onMemberSelect={handleMemberSelect}/)
      assert.match(rankings, /selectedMemberId={panelMember/)
      assert.match(rankings, /emphasized/)
      assert.match(detail, /MemberRankingCharts/)
    },
  },
  {
    id: 8,
    name: '순위 변화 / 기록 향상 그래프',
    check: () => {
      assert.match(charts, /label: '순위'/)
      assert.match(charts, /label: '기록'/)
      assert.match(charts, /label: '마일리지'/)
      assert.match(charts, /graphChartTabForRankingView/)
      assert.match(charts, /GraphChartTabs/)
      assert.match(detail, /buildMemberRankingHistorySeries/)
      assert.match(detail, /buildLeagueRankComparisonChart/)
    },
  },
  {
    id: 9,
    name: '랭킹 이름 표시',
    check: () => {
      assert.match(rankings, /formatRankingMemberName/)
    },
  },
  {
    id: 10,
    name: '모바일·PC 통합 반응형',
    check: () => {
      assert.match(rankings, /lg:max-w-2xl/)
      assert.match(rankings, /MobileGraphFilterStrip/)
      assert.match(rankings, /전체 랭킹/)
      assert.match(rankings, /RankingPreview/)
      assert.match(rankings, /오늘 러닝 기록 추가/)
      assert.match(rankings, /overflow-x-hidden/)
      assert.match(rankings, /MemberLeagueStatusCard/)
    },
  },
]

const failed = []
for (const item of criteria) {
  try {
    item.check()
  } catch (error) {
    failed.push({ id: item.id, name: item.name, error: error.message })
  }
}

if (failed.length > 0) {
  console.error('[verify-ranking-completion-criteria] FAILED')
  for (const f of failed) {
    console.error(`  ${f.id}. ${f.name}: ${f.error}`)
  }
  process.exit(1)
}

console.log(`[verify-ranking-completion-criteria] OK — ${criteria.length}/${criteria.length} criteria`)
for (const item of criteria) {
  console.log(`  ✓ ${item.id}. ${item.name}`)
}
