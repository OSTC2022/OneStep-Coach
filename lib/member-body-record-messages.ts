/** 저장·마이그레이션 안내 문구 */
export function describeBodyRecordMigrationHint(hint: string | undefined): {
  title: string
  description: string
} | null {
  if (!hint) return null
  if (hint.includes('protein-slots')) {
    return {
      title: '시간대별 단백질 기록이 저장되지 않았습니다',
      description:
        '오늘 합계 단백질은 저장되었습니다. 아침·점심·저녁 등 시간대별 기록을 남기려면 Supabase SQL Editor에서 add-member-protein-intake-by-slot.sql을 실행해주세요.',
    }
  }
  if (hint.includes('protein-tracking')) {
    return {
      title: '단백질 자동 계산 항목이 저장되지 않았습니다',
      description:
        '컨디션·회복 기록은 저장되었습니다. 단백질 목표·섭취량 저장을 위해 Supabase SQL Editor에서 add-member-protein-tracking.sql을 실행해주세요.',
    }
  }
  if (hint.includes('nutrition')) {
    return {
      title: '회복·영양 항목만 저장되지 않았습니다',
      description:
        '컨디션·수면·피로 기록은 저장되었습니다. 회복·영양도 저장하려면 Supabase SQL Editor에서 add-member-body-nutrition-fields.sql과 add-member-protein-tracking.sql을 실행해주세요.',
    }
  }
  if (hint.includes('pain-detail')) {
    return {
      title: '통증 상세 항목이 저장되지 않았습니다',
      description:
        '통증 부위는 저장되었습니다. 통증 정도·기타 부위 입력을 저장하려면 Supabase SQL Editor에서 add-member-pain-detail-fields.sql을 실행해주세요.',
    }
  }
  if (hint.includes('wellness')) {
    return {
      title: '옵션 기록이 저장되지 않았습니다',
      description:
        '체중·키만 저장되었습니다. Supabase SQL Editor에서 add-member-body-wellness-fields.sql을 실행해주세요.',
    }
  }
  if (hint.includes('body-records')) {
    return {
      title: '신체 기록 테이블이 없습니다',
      description: 'Supabase SQL Editor에서 add-member-body-records.sql을 실행해주세요.',
    }
  }
  return {
    title: '일부 항목이 저장되지 않았습니다',
    description: `${hint} 실행이 필요합니다.`,
  }
}
