import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import {
  buildNutritionHistoryBadges,
  getNutritionChoiceTone,
} from '@/lib/member-body-nutrition'
import { calculateProteinAchievementPercent } from '@/lib/member-body-protein'
import {
  buildWellnessHistoryBadges,
  formatPainAreaLabel,
  getPainDisplayTone,
  getWellnessChoiceTone,
  wellnessChoiceLabel,
  wellnessReportLabel,
  type WellnessHistoryBadge,
} from '@/lib/member-body-wellness'

export const RECORD_HISTORY_PRIMARY_LIMIT = 4

type HistoryBadgeCategory =
  | 'sleep'
  | 'condition'
  | 'pain'
  | 'protein'
  | 'fatigue'
  | 'muscle_soreness'
  | 'meal'
  | 'nutrition_other'

type CategorizedBadge = WellnessHistoryBadge & {
  category: HistoryBadgeCategory
  priority: number
}

const BADGE_PRIORITY: Record<HistoryBadgeCategory, number> = {
  sleep: 1,
  condition: 2,
  pain: 3,
  protein: 4,
  fatigue: 5,
  muscle_soreness: 6,
  meal: 7,
  nutrition_other: 8,
}

function buildCategorizedHistoryBadges(record: MemberBodyRecord): CategorizedBadge[] {
  const badges: CategorizedBadge[] = []

  if (record.sleep_hours) {
    badges.push({
      category: 'sleep',
      priority: BADGE_PRIORITY.sleep,
      label: `수면 ${wellnessChoiceLabel('sleep_hours', record.sleep_hours)}`,
      tone: getWellnessChoiceTone('sleep_hours', record.sleep_hours)!,
    })
  }
  if (record.condition) {
    badges.push({
      category: 'condition',
      priority: BADGE_PRIORITY.condition,
      label: `컨디션 ${wellnessReportLabel('condition', record.condition)}`,
      tone: getWellnessChoiceTone('condition', record.condition)!,
    })
  }
  if (record.pain_area && record.pain_area !== 'none') {
    badges.push({
      category: 'pain',
      priority: BADGE_PRIORITY.pain,
      label: `통증 ${formatPainAreaLabel(record.pain_area, record.pain_area_note)}`,
      tone: getPainDisplayTone(record.pain_area, record.pain_level),
    })
  }
  if (
    record.protein_intake_g != null &&
    record.protein_target_g != null &&
    record.protein_status
  ) {
    const percent = calculateProteinAchievementPercent(
      record.protein_intake_g,
      record.protein_target_g,
    )
    badges.push({
      category: 'protein',
      priority: BADGE_PRIORITY.protein,
      label: percent != null ? `단백질 ${percent}%` : '단백질 기록',
      tone: getNutritionChoiceTone('protein_status', record.protein_status)!,
    })
  }
  if (record.fatigue) {
    badges.push({
      category: 'fatigue',
      priority: BADGE_PRIORITY.fatigue,
      label: `피로 ${wellnessChoiceLabel('fatigue', record.fatigue)}`,
      tone: getWellnessChoiceTone('fatigue', record.fatigue)!,
    })
  }
  if (record.muscle_soreness) {
    badges.push({
      category: 'muscle_soreness',
      priority: BADGE_PRIORITY.muscle_soreness,
      label: `근육통 ${wellnessChoiceLabel('muscle_soreness', record.muscle_soreness)}`,
      tone: getWellnessChoiceTone('muscle_soreness', record.muscle_soreness)!,
    })
  }
  if (record.meal_status) {
    badges.push({
      category: 'meal',
      priority: BADGE_PRIORITY.meal,
      label: `식사 ${wellnessChoiceLabel('meal_status', record.meal_status)}`,
      tone: getWellnessChoiceTone('meal_status', record.meal_status)!,
    })
  }

  const wellnessExtras = buildWellnessHistoryBadges(record).filter((badge) => {
    if (badge.label.startsWith('수면 ')) return false
    if (badge.label.startsWith('컨디션 ')) return false
    if (badge.label.startsWith('통증 ')) return false
    if (badge.label.startsWith('피로 ')) return false
    if (badge.label.startsWith('근육통 ')) return false
    if (badge.label.startsWith('식사 ')) return false
    return true
  })

  const nutritionExtras = buildNutritionHistoryBadges(record).filter((badge) => {
    if (badge.label.startsWith('단백질 ')) return false
    return true
  })

  for (const badge of [...wellnessExtras, ...nutritionExtras]) {
    badges.push({
      ...badge,
      category: 'nutrition_other',
      priority: BADGE_PRIORITY.nutrition_other,
    })
  }

  return badges.sort((a, b) => a.priority - b.priority)
}

export function groupRecordHistoryBadges(record: MemberBodyRecord): {
  primary: WellnessHistoryBadge[]
  extra: WellnessHistoryBadge[]
} {
  const categorized = buildCategorizedHistoryBadges(record)
  const primary = categorized
    .slice(0, RECORD_HISTORY_PRIMARY_LIMIT)
    .map(({ label, tone }) => ({ label, tone }))
  const extra = categorized
    .slice(RECORD_HISTORY_PRIMARY_LIMIT)
    .map(({ label, tone }) => ({ label, tone }))

  return { primary, extra }
}
