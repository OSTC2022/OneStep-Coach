/** 랭킹·그래프 빈 상태 / 오류 메시지 */

export const RANKING_EMPTY_PB = {
  title: '아직 등록된 기록이 없습니다.',
  description: '첫 PB를 등록하면 랭킹에 표시됩니다.',
} as const

export const RANKING_EMPTY_MILEAGE = {
  title: '이번 달 러닝 기록이 아직 없습니다.',
  description: '첫 기록을 추가해 랭킹에 도전해보세요.',
} as const

export const RANKING_EMPTY_GRAPH = {
  title: '아직 추이를 표시할 기록이 부족합니다.',
  description: '러닝 기록을 더 쌓으면 변화 그래프를 볼 수 있습니다.',
} as const

export const RANKING_LOAD_ERROR_MESSAGE =
  '데이터를 불러오지 못했습니다. 다시 시도해주세요.'
