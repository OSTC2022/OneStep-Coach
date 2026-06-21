/** 원스텝 러닝 리그 — 성인 이벤트 구조화 콘텐츠 */

export const RUNNING_LEAGUE_NAME = '원스텝 러닝 리그'
export const RUNNING_LEAGUE_EN = 'ONE STEP RUNNING LEAGUE'

export const RUNNING_LEAGUE_TAGLINE =
  '한 달 동안 출석, 러닝 거리, 기록 향상, 미션 달성, 팀워크를 기준으로 진행되는 성인 러닝 챌린지'

export const RUNNING_LEAGUE_INTRO =
  '성인 러닝반 이벤트를 하나씩 따로 운영하기보다, 전체를 묶어 리그로 운영합니다. 매달 반복하기 좋고, 회원에게 소속감을 줍니다.'

export const RUNNING_LEAGUE_KEY_MESSAGE =
  '빠른 사람만을 위한 이벤트가 아니라, 각자의 목표를 완주하는 러닝 리그.'

export const SCORE_WEIGHTS = [
  { item: '출석 점수', ratio: '30%' },
  { item: '개인 목표 달성', ratio: '25%' },
  { item: '기록 향상', ratio: '20%' },
  { item: '러닝 마일리지', ratio: '15%' },
  { item: '회복관리 / 스트레칭', ratio: '10%' },
] as const

export const ATTENDANCE_SCORES = [
  { criteria: '수업 출석 1회', points: '10점' },
  { criteria: '지각 없이 참석', points: '3점' },
  { criteria: '보강 포함 주 2회 이상 참석', points: '보너스 10점' },
  { criteria: '한 달 개근', points: '보너스 30점' },
] as const

export const GOAL_LEVELS = [
  { level: '입문자', goal: '20분 연속 달리기' },
  { level: '초급자', goal: '5km 완주' },
  { level: '중급자', goal: '5km 기록 단축' },
  { level: '10km반', goal: '10km 목표 페이스 유지' },
  { level: '하프/마라톤반', goal: '롱런 거리 달성' },
  { level: '다이어트 목적', goal: '주 2회 출석 + 체중관리' },
] as const

export const GOAL_ACHIEVEMENT_SCORES = [
  { rate: '목표 100% 달성', points: '100점' },
  { rate: '목표 80% 이상 달성', points: '80점' },
  { rate: '목표 60% 이상 달성', points: '60점' },
  { rate: '목표 40% 이상 달성', points: '40점' },
] as const

export const RECORD_TEST_OPTIONS = [
  { event: '1km 기록 측정', target: '초보~중급' },
  { event: '3km 기록 측정', target: '중급' },
  { event: '5km 기록 측정', target: '일반 러너' },
  { event: '10km 기록 측정', target: '대회 준비자' },
] as const

export const MILEAGE_SCORES = [
  { distance: '20km', points: '40점' },
  { distance: '40km', points: '60점' },
  { distance: '60km', points: '80점' },
  { distance: '80km 이상', points: '100점 (상한)' },
] as const

export const RECOVERY_CHECKS = [
  { item: '수업 후 스트레칭 완료', points: '3점' },
  { item: '통증 체크 입력', points: '3점' },
  { item: '컨디션 체크 입력', points: '3점' },
  { item: '회복 조깅 또는 휴식 실천', points: '5점' },
  { item: '코치가 정한 강도 지키기', points: '5점' },
] as const

export const WEEKLY_PLAN = [
  {
    week: '1주차',
    title: '시작 측정 주간',
    focus: '참가 등록 · 개인 목표 설정 · 기준 기록 측정 · 레벨 분류',
    mission: '개인 목표 설정, 1회 이상 출석',
    coachNote:
      '단순히 많이 뛰는 챌린지가 아니라, 각자 목표를 정하고 한 달 동안 얼마나 성장했는지 확인하는 러닝 리그입니다.',
  },
  {
    week: '2주차',
    title: '루틴 형성 주간',
    focus: '출석 점수 누적 · 주간 미션 · 페이스 조절 · 자세 피드백',
    mission: '주 2회 출석, 스트레칭 인증, 통증 체크 입력',
    coachNote: '꾸준한 출석과 회복 습관이 점수의 핵심입니다.',
  },
  {
    week: '3주차',
    title: '페이스 적응 주간',
    focus: '목표 페이스 훈련 · 중간 기록 체크 · 코치 피드백',
    mission: '목표 페이스 ±5초 맞추기, 무리하지 않고 강도 지키기',
    coachNote: '빨리 뛰는 것보다 페이스를 조절하는 능력이 중요합니다.',
  },
  {
    week: '4주차',
    title: '최종 측정 / 시상 주간',
    focus: '최종 기록 측정 · 총점 집계 · 부문별 시상 · 회원 피드백',
    mission: '기록 재측정, 후기 작성',
    coachNote: '최고 기록상과 최다 향상상을 따로 시상합니다.',
  },
] as const

export const AWARD_CATEGORIES = [
  { name: '이달의 러너 MVP', criteria: '총점 1위' },
  { name: '최고 기록상', criteria: '1km / 3km / 5km / 10km 중 선택 종목 최고 기록' },
  { name: '최다 향상상', criteria: '월초 대비 기록 향상 폭 최대' },
  { name: '성실 출석상', criteria: '출석 점수 최고' },
  { name: '페이스 장인상', criteria: '목표 페이스 오차 최소' },
  { name: '첫 완주상', criteria: '처음으로 5km/10km 완주' },
  { name: '회복관리상', criteria: '회복관리·스트레칭 체크 우수' },
  { name: '도전상', criteria: '입문자 중 가장 적극적 참여' },
  { name: '분위기 메이커상', criteria: '팀워크, 응원, 참여도 우수 (코치 선정)' },
] as const

export const REWARD_SUGGESTIONS = [
  { award: 'MVP', reward: '다음 달 1회 보강권 + 인증서' },
  { award: '최다 향상상', reward: '스포츠 양말 또는 에너지젤' },
  { award: '성실 출석상', reward: '테이핑 1회 무료' },
  { award: '첫 완주상', reward: '완주 인증 카드' },
  { award: '페이스 장인상', reward: '원스텝 러닝 기록 카드' },
  { award: '회복관리상', reward: '스트레칭 밴드' },
  { award: '분위기 메이커상', reward: '커피 쿠폰' },
] as const

export const SUB_EVENTS = [
  {
    name: '5K PB 챌린지',
    summary: '한 달 동안 5km 개인 기록 향상 — 기록 향상 콘텐츠 제작에 좋음',
  },
  {
    name: '첫 5km 완주 프로젝트',
    summary: '입문자 모집용 — 4주 안에 5km 완주, SNS 스토리텔링에 최적',
  },
  {
    name: '페이스 장인 챌린지',
    summary: '정해진 페이스에 가장 가깝게 달리기 — 초보자도 우승 가능',
  },
  {
    name: '원스텝 팀 릴레이 런',
    summary: '팀 출석·거리·응원으로 센터 분위기 활성화',
  },
  {
    name: '바디 컨디션 챌린지',
    summary: '출석·루틴·식단 중심 — 체중보다 습관과 컨디션 강조',
  },
] as const

export const LEAGUE_PURPOSES = [
  '성인 회원 출석률 증가',
  '러닝 습관 형성',
  '기록 향상 동기부여',
  '센터 분위기 활성화',
  '재등록률 상승',
  'SNS 홍보 콘텐츠 확보',
] as const

export function formatLeagueMonthLabel(date: Date): string {
  return `${date.getMonth() + 1}월`
}

export function leagueMonthRange(date = new Date()): {
  year: number
  month: number
  monthLabel: string
  title: string
  startLocal: string
  endLocal: string
} {
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthLabel = formatLeagueMonthLabel(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    year,
    month: month + 1,
    monthLabel,
    title: `${monthLabel} 원스텝 러닝 리그`,
    startLocal: `${year}-${pad(month + 1)}-01T09:00`,
    endLocal: `${year}-${pad(month + 1)}-${pad(lastDay)}T21:00`,
  }
}

export function buildRunningLeagueSummaryBody(range: ReturnType<typeof leagueMonthRange>): string {
  return `${range.monthLabel} 원스텝 성인 러닝반에서 출석, 기록 향상, 개인 목표 달성, 러닝 마일리지, 회복관리를 함께 평가하는 원스텝 러닝 리그를 진행합니다.

빠른 사람만을 위한 이벤트가 아닙니다. 꾸준히 나온 분, 처음 5km를 완주한 분, 목표 페이스를 지킨 분, 가장 많이 성장한 분 모두가 주인공입니다.

기간: ${range.monthLabel} 1일 ~ ${range.monthLabel} 말일
대상: 원스텝 성인 러닝 회원 전체
시상: MVP / 최다 향상상 / 성실 출석상 / 첫 완주상 / 페이스 장인상 / 회복관리상

${RUNNING_LEAGUE_KEY_MESSAGE}`
}

export function formatLeaguePeriodLabel(
  startsAt: string | null,
  endsAt: string | null,
  fallbackMonthLabel?: string,
): string {
  if (startsAt && endsAt) {
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`
    }
  }
  if (fallbackMonthLabel) {
    return `${fallbackMonthLabel} 1일 ~ ${fallbackMonthLabel} 말일`
  }
  return '4주 단위 (월 1일 ~ 말일)'
}
