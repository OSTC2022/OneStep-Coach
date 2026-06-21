'use server'

import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { canAddBodyRecordFor } from '@/lib/auth/member-access'
import {
  DEFAULT_MEMBER_PROTEIN_SETTINGS,
  type MemberProteinSettings,
  type ProteinGoalMode,
} from '@/lib/member-body-protein'
import {
  normalizeNutritionInput,
  type BodyNutritionInput,
  type MemberBodyRecordNutrition,
} from '@/lib/member-body-nutrition'
import {
  normalizeWellnessInput,
  parseWellnessField,
  type BodyWellnessInput,
  type MemberBodyRecordWellness,
  CONDITION_CHOICES,
  FATIGUE_CHOICES,
  MEAL_STATUS_CHOICES,
  MUSCLE_SORENESS_CHOICES,
  PAIN_AREA_CHOICES,
  SLEEP_HOUR_CHOICES,
} from '@/lib/member-body-wellness'
import { isBootstrapBodyRecord } from '@/lib/member-body-record-utils'
import { roundBodyMetric } from '@/lib/member-utils'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export type MemberBodyRecord = {
  id: string
  member_id: string
  recorded_at: string
  weight_kg: number
  height_cm: number | null
  note: string | null
  created_at: string
} & MemberBodyRecordWellness &
  MemberBodyRecordNutrition

const BASIC_SELECT =
  'id, member_id, recorded_at, weight_kg, height_cm, note, created_at'

const WELLNESS_SELECT =
  `${BASIC_SELECT}, sleep_hours, condition, fatigue, muscle_soreness, pain_area, meal_status`

const WELLNESS_WITH_PAIN_SELECT =
  `${WELLNESS_SELECT}, pain_level, pain_area_note`

const NUTRITION_SELECT =
  `${WELLNESS_SELECT}, protein_status, protein_target_g, protein_intake_g, protein_goal_multiplier, protein_intake_by_slot, post_workout_meal_status, hydration_status, supplement_status, nutrition_note`

const FULL_SELECT =
  `${WELLNESS_WITH_PAIN_SELECT}, protein_status, protein_target_g, protein_intake_g, protein_goal_multiplier, protein_intake_by_slot, post_workout_meal_status, hydration_status, supplement_status, nutrition_note`

const FULL_SELECT_WITHOUT_PROTEIN_SLOTS =
  `${WELLNESS_WITH_PAIN_SELECT}, protein_status, protein_target_g, protein_intake_g, protein_goal_multiplier, post_workout_meal_status, hydration_status, supplement_status, nutrition_note`

const BODY_RECORD_SELECT = FULL_SELECT

function isMissingNutritionColumns(message: string | undefined) {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('protein_status') ||
    lower.includes('protein_target_g') ||
    lower.includes('protein_intake_g') ||
    lower.includes('protein_goal_multiplier') ||
    lower.includes('post_workout_meal_status') ||
    lower.includes('hydration_status') ||
    lower.includes('supplement_status') ||
    lower.includes('nutrition_note')
  )
}

function isMissingProteinIntakeBySlotColumn(message: string | undefined) {
  if (!message) return false
  return message.toLowerCase().includes('protein_intake_by_slot')
}

function isMissingWellnessColumns(message: string | undefined) {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('sleep_hours') ||
    lower.includes('muscle_soreness') ||
    lower.includes('meal_status') ||
    lower.includes('condition') ||
    lower.includes('fatigue') ||
    lower.includes('pain_area') ||
    (lower.includes('column') && lower.includes('does not exist'))
  )
}

function isMissingPainDetailColumns(message: string | undefined) {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('pain_level') || lower.includes('pain_area_note')
}

function isMissingExtendedBodyColumns(message: string | undefined) {
  return isMissingNutritionColumns(message) || isMissingWellnessColumns(message)
}

type BodyRecordSaveTier = 'full' | 'wellness' | 'basic'

function selectForTier(tier: BodyRecordSaveTier, options?: { includePainDetail?: boolean }) {
  const includePainDetail = options?.includePainDetail !== false
  switch (tier) {
    case 'full':
      return includePainDetail ? FULL_SELECT : NUTRITION_SELECT
    case 'wellness':
      return includePainDetail ? WELLNESS_WITH_PAIN_SELECT : WELLNESS_SELECT
    default:
      return BASIC_SELECT
  }
}

function wellnessPayload(input?: BodyWellnessInput, options?: { includePainDetail?: boolean }) {
  const normalized = normalizeWellnessInput(input)
  const base = {
    sleep_hours: normalized.sleep_hours,
    condition: normalized.condition,
    fatigue: normalized.fatigue,
    muscle_soreness: normalized.muscle_soreness,
    pain_area: normalized.pain_area,
    meal_status: normalized.meal_status,
  }
  if (options?.includePainDetail === false) return base
  return {
    ...base,
    pain_level: normalized.pain_level,
    pain_area_note: normalized.pain_area_note,
  }
}

function nutritionPayload(
  input?: BodyNutritionInput,
  options?: { weightKg?: number; proteinSettings?: Partial<MemberProteinSettings> },
) {
  const nutrition = normalizeNutritionInput(input, options)
  return {
    protein_status: nutrition.protein_status,
    protein_target_g: nutrition.protein_target_g,
    protein_intake_g: nutrition.protein_intake_g,
    protein_intake_by_slot: nutrition.protein_intake_by_slot,
    protein_goal_multiplier: nutrition.protein_goal_multiplier,
    post_workout_meal_status: nutrition.post_workout_meal_status,
    hydration_status: nutrition.hydration_status,
    supplement_status: nutrition.supplement_status,
    nutrition_note: nutrition.nutrition_note,
  }
}

function payloadForTier(
  tier: BodyRecordSaveTier,
  base: { weight_kg: number; height_cm: number | null },
  wellness?: BodyWellnessInput,
  nutrition?: BodyNutritionInput,
  proteinSettings?: Partial<MemberProteinSettings>,
  options?: { includePainDetail?: boolean },
) {
  switch (tier) {
    case 'full':
      return {
        ...base,
        ...wellnessPayload(wellness, options),
        ...nutritionPayload(nutrition, {
          weightKg: base.weight_kg,
          proteinSettings,
        }),
      }
    case 'wellness':
      return { ...base, ...wellnessPayload(wellness, options) }
    default:
      return base
  }
}

function migrationHintForTier(tier: BodyRecordSaveTier): string | undefined {
  switch (tier) {
    case 'wellness':
      return 'supabase/add-member-body-nutrition-fields.sql'
    case 'basic':
      return 'supabase/add-member-body-wellness-fields.sql'
    default:
      return undefined
  }
}

function parseNutritionRow(row: Record<string, unknown>): MemberBodyRecordNutrition {
  return normalizeNutritionInput({
    protein_status: row.protein_status as BodyNutritionInput['protein_status'],
    protein_target_g: row.protein_target_g as number | null | undefined,
    protein_intake_g: row.protein_intake_g as number | null | undefined,
    protein_intake_by_slot: row.protein_intake_by_slot as BodyNutritionInput['protein_intake_by_slot'],
    protein_goal_multiplier: row.protein_goal_multiplier as number | null | undefined,
    post_workout_meal_status:
      row.post_workout_meal_status as BodyNutritionInput['post_workout_meal_status'],
    hydration_status: row.hydration_status as BodyNutritionInput['hydration_status'],
    supplement_status: row.supplement_status as BodyNutritionInput['supplement_status'],
    nutrition_note: row.nutrition_note as string | null | undefined,
  })
}

function parseWellnessRow(row: Record<string, unknown>): MemberBodyRecordWellness {
  const painArea = parseWellnessField(row.pain_area, PAIN_AREA_CHOICES)
  const painLevelRaw = row.pain_level
  const painLevel =
    painArea && painArea !== 'none' && painLevelRaw != null
      ? Number(painLevelRaw)
      : null

  return {
    sleep_hours: parseWellnessField(row.sleep_hours, SLEEP_HOUR_CHOICES),
    condition: parseWellnessField(row.condition, CONDITION_CHOICES),
    fatigue: parseWellnessField(row.fatigue, FATIGUE_CHOICES),
    muscle_soreness: parseWellnessField(row.muscle_soreness, MUSCLE_SORENESS_CHOICES),
    pain_area: painArea,
    pain_level:
      painLevel != null && Number.isFinite(painLevel) && painLevel >= 1 && painLevel <= 10
        ? Math.round(painLevel)
        : null,
    pain_area_note:
      painArea === 'other' && typeof row.pain_area_note === 'string'
        ? row.pain_area_note.trim() || null
        : null,
    meal_status: parseWellnessField(row.meal_status, MEAL_STATUS_CHOICES),
  }
}

function parseExtendedBodyRow(
  row: Record<string, unknown>,
): MemberBodyRecordWellness & MemberBodyRecordNutrition {
  return {
    ...parseWellnessRow(row),
    ...parseNutritionRow(row),
  }
}

function isMissingBodyRecordsTable(message: string | undefined, code?: string) {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    code === 'PGRST205' ||
    lower.includes('member_body_records') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  )
}

function normalizeRecord(row: Record<string, unknown>): MemberBodyRecord {
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    recorded_at: String(row.recorded_at),
    weight_kg: roundBodyMetric(row.weight_kg as number | string) ?? Number(row.weight_kg),
    height_cm:
      row.height_cm != null
        ? roundBodyMetric(row.height_cm as number | string)
        : null,
    note: (row.note as string | null | undefined) ?? null,
    created_at: String(row.created_at),
    ...parseExtendedBodyRow(row),
  }
}

async function queryMemberBodyRecords(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  memberId: string,
) {
  const run = (select: string) =>
    supabase
      .from('member_body_records')
      .select(select)
      .eq('member_id', memberId)
      .order('recorded_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(120)

  let selectTier: BodyRecordSaveTier = 'full'
  let { data, error } = await run(FULL_SELECT)
  if (error && isMissingProteinIntakeBySlotColumn(error.message)) {
    const retry = await run(FULL_SELECT_WITHOUT_PROTEIN_SLOTS)
    data = retry.data
    error = retry.error
  }
  if (error && isMissingNutritionColumns(error.message)) {
    selectTier = 'wellness'
    const retry = await run(WELLNESS_WITH_PAIN_SELECT)
    data = retry.data
    error = retry.error
  }
  if (error && isMissingPainDetailColumns(error.message)) {
    const retry = await run(WELLNESS_SELECT)
    data = retry.data
    error = retry.error
  }
  if (error && isMissingWellnessColumns(error.message)) {
    selectTier = 'basic'
    const retry = await run(BASIC_SELECT)
    data = retry.data
    error = retry.error
  }

  return { data, error, selectTier }
}

async function persistMemberBodyRecord(
  supabase: Awaited<ReturnType<typeof memberBodyWriteClient>>,
  params: {
    memberId: string
    recordedAt: string
    existingId?: string
    basePayload: { weight_kg: number; height_cm: number | null }
    wellness?: BodyWellnessInput
    nutrition?: BodyNutritionInput
    proteinSettings?: Partial<MemberProteinSettings>
  },
): Promise<{
  record?: MemberBodyRecord
  error?: string
  migrationHint?: string
}> {
  const tiers: BodyRecordSaveTier[] = ['full', 'wellness', 'basic']
  const painDetailAttempts = [true, false] as const

  for (const tier of tiers) {
    for (const includePainDetail of painDetailAttempts) {
      if (tier === 'basic' && !includePainDetail) continue

      const payload = payloadForTier(
        tier,
        params.basePayload,
        params.wellness,
        params.nutrition,
        params.proteinSettings,
        tier === 'basic' ? undefined : { includePainDetail },
      )
      const select = selectForTier(tier, tier === 'basic' ? undefined : { includePainDetail })

      const runPersist = async (body: Record<string, unknown>) =>
        params.existingId
          ? await supabase
              .from('member_body_records')
              .update(body)
              .eq('id', params.existingId)
              .select(select)
              .single()
          : await supabase
              .from('member_body_records')
              .insert({
                member_id: params.memberId,
                recorded_at: params.recordedAt,
                ...body,
              })
              .select(select)
              .single()

      let result = await runPersist(payload)

      if (
        result.error &&
        isMissingProteinIntakeBySlotColumn(result.error.message) &&
        'protein_intake_by_slot' in payload
      ) {
        const { protein_intake_by_slot: _removed, ...fallbackPayload } = payload
        result = await runPersist(fallbackPayload)
        if (!result.error && result.data) {
          const saved = normalizeRecord(result.data as Record<string, unknown>)
          return {
            record: saved,
            migrationHint:
              'supabase/add-member-protein-intake-by-slot.sql (protein-slots)',
          }
        }
      }

      if (!result.error && result.data) {
        const saved = normalizeRecord(result.data as Record<string, unknown>)
        const migrationHint =
          !includePainDetail && tier !== 'basic'
            ? 'supabase/add-member-pain-detail-fields.sql (pain-detail)'
            : migrationHintForTier(tier)
        return migrationHint ? { record: saved, migrationHint } : { record: saved }
      }

      if (
        includePainDetail &&
        tier !== 'basic' &&
        isMissingPainDetailColumns(result.error?.message)
      ) {
        continue
      }

      if (!isMissingExtendedBodyColumns(result.error?.message)) {
        return { error: result.error?.message ?? '기록 저장에 실패했습니다.' }
      }
      break
    }
  }

  return { error: '기록 저장에 실패했습니다.' }
}

function createBootstrapRecord(
  memberId: string,
  fallback: {
    weight_kg: number | null
    height_cm?: number | null
    registered_at: string
    body_baseline_recorded_at?: string | null
  },
): MemberBodyRecord | null {
  if (!fallback.weight_kg || fallback.weight_kg <= 0) return null
  const weight = roundBodyMetric(fallback.weight_kg) ?? Number(fallback.weight_kg)
  const baselineDate = (
    fallback.body_baseline_recorded_at ?? fallback.registered_at
  ).split('T')[0]
  return {
    id: `bootstrap-${memberId}`,
    member_id: memberId,
    recorded_at: baselineDate,
    weight_kg: weight,
    height_cm: fallback.height_cm != null ? roundBodyMetric(fallback.height_cm) : null,
    note: '신체정보 초기 설정',
    created_at: fallback.registered_at,
    sleep_hours: null,
    condition: null,
    fatigue: null,
    muscle_soreness: null,
    pain_area: null,
    pain_level: null,
    pain_area_note: null,
    meal_status: null,
    protein_status: null,
    protein_target_g: null,
    protein_intake_g: null,
    protein_intake_by_slot: null,
    protein_goal_multiplier: null,
    post_workout_meal_status: null,
    hydration_status: null,
    supplement_status: null,
    nutrition_note: null,
  }
}

const PROTEIN_GOAL_MODES: ProteinGoalMode[] = [
  'basic',
  'training',
  'high_intensity',
  'recovery',
]

function parseProteinGoalMode(value: unknown): ProteinGoalMode {
  return typeof value === 'string' &&
    PROTEIN_GOAL_MODES.includes(value as ProteinGoalMode)
    ? (value as ProteinGoalMode)
    : DEFAULT_MEMBER_PROTEIN_SETTINGS.protein_goal_mode
}

/** 선수별 단백질 목표 설정 (members 테이블, 없으면 기본값) */
export async function getMemberProteinSettings(
  memberId: string,
): Promise<MemberProteinSettings> {
  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('members')
    .select('protein_goal_multiplier, protein_goal_mode')
    .eq('id', memberId)
    .maybeSingle()

  if (error || !data) {
    return { ...DEFAULT_MEMBER_PROTEIN_SETTINGS }
  }

  const multiplier = Number(data.protein_goal_multiplier)
  return {
    protein_goal_multiplier:
      Number.isFinite(multiplier) && multiplier > 0
        ? multiplier
        : DEFAULT_MEMBER_PROTEIN_SETTINGS.protein_goal_multiplier,
    protein_goal_mode: parseProteinGoalMode(data.protein_goal_mode),
  }
}

/** DB 기록과 합쳐 신체정보 초기 설정(가상) 기록을 항상 유지 */
function mergeWithBootstrapRecord(
  records: MemberBodyRecord[],
  memberId: string,
  fallback?: {
    weight_kg: number | null
    height_cm?: number | null
    registered_at: string
    body_baseline_recorded_at?: string | null
  },
): MemberBodyRecord[] {
  const bootstrap = fallback ? createBootstrapRecord(memberId, fallback) : null
  const withoutBootstrap = records.filter((record) => !record.id.startsWith('bootstrap-'))
  if (!bootstrap) return withoutBootstrap

  return [...withoutBootstrap, bootstrap].sort((a, b) => {
    const dateCmp = a.recorded_at.localeCompare(b.recorded_at)
    if (dateCmp !== 0) return dateCmp
    if (a.id.startsWith('bootstrap-')) return -1
    if (b.id.startsWith('bootstrap-')) return 1
    return a.created_at.localeCompare(b.created_at)
  })
}

async function assertCanViewBodyRecords(memberId: string): Promise<{ error?: string }> {
  const allowed = await canAddBodyRecordFor(memberId)
  if (!allowed) return { error: '권한이 없습니다.' }
  return {}
}

export async function getMemberBodyRecords(
  memberId: string,
  fallback?: {
    weight_kg: number | null
    height_cm?: number | null
    registered_at: string
    body_baseline_recorded_at?: string | null
  },
): Promise<{
  records: MemberBodyRecord[]
  tableReady: boolean
  wellnessColumnsReady: boolean
  nutritionColumnsReady: boolean
}> {
  const access = await assertCanViewBodyRecords(memberId)
  if (access.error) {
    return {
      records: [],
      tableReady: true,
      wellnessColumnsReady: false,
      nutritionColumnsReady: false,
    }
  }

  const supabase = await createStaffDataClient()
  const { data, error, selectTier } = await queryMemberBodyRecords(supabase, memberId)

  if (error && isMissingBodyRecordsTable(error.message, error.code)) {
    return {
      records: mergeWithBootstrapRecord([], memberId, fallback),
      tableReady: false,
      wellnessColumnsReady: false,
      nutritionColumnsReady: false,
    }
  }

  if (error) {
    console.error('getMemberBodyRecords:', error)
    return {
      records: mergeWithBootstrapRecord([], memberId, fallback),
      tableReady: true,
      wellnessColumnsReady: false,
      nutritionColumnsReady: false,
    }
  }

  return {
    records: mergeWithBootstrapRecord(
      (data ?? []).map(normalizeRecord),
      memberId,
      fallback,
    ),
    tableReady: true,
    wellnessColumnsReady: selectTier === 'full' || selectTier === 'wellness',
    nutritionColumnsReady: selectTier === 'full',
  }
}

async function memberBodyWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return await createStaffDataClient()
  }
}

export async function addMemberBodyRecord(
  memberId: string,
  weightKg: number,
  options?: {
    recordedAt?: string
    heightCm?: number | null
    wellness?: BodyWellnessInput
    nutrition?: BodyNutritionInput
    proteinSettings?: Partial<MemberProteinSettings>
    /** 수업현황 체중 입력 등 — 클라이언트 상태가 있어 전체 갱신 생략 */
    skipDashboardRevalidate?: boolean
  },
): Promise<{ record?: MemberBodyRecord; error?: string; migrationHint?: string }> {
  const access = await canAddBodyRecordFor(memberId)
  if (!access) {
    return { error: '권한이 없습니다.' }
  }

  const weight = roundBodyMetric(weightKg)
  if (weight == null || weight >= 500) {
    return { error: '체중을 올바르게 입력해주세요.' }
  }

  const recordedAt = options?.recordedAt ?? format(new Date(), 'yyyy-MM-dd')
  const supabase = await memberBodyWriteClient()
  const recordHeightCm =
    options?.heightCm != null ? roundBodyMetric(options.heightCm) : null
  const { data: existingToday } = await supabase
    .from('member_body_records')
    .select('id')
    .eq('member_id', memberId)
    .eq('recorded_at', recordedAt)
    .maybeSingle()

  const basePayload = {
    weight_kg: weight,
    height_cm: recordHeightCm,
  }

  const proteinSettings =
    options?.proteinSettings ?? (await getMemberProteinSettings(memberId))

  const persistResult = await persistMemberBodyRecord(supabase, {
    memberId,
    recordedAt,
    existingId: existingToday?.id,
    basePayload,
    wellness: options?.wellness,
    nutrition: options?.nutrition,
    proteinSettings,
  })

  if (persistResult.error) {
    if (isMissingBodyRecordsTable(persistResult.error)) {
      return {
        error: '신체 기록 테이블이 없습니다.',
        migrationHint: 'supabase/add-member-body-records.sql',
      }
    }
    return { error: persistResult.error }
  }

  const saved = persistResult.record

  if (!options?.skipDashboardRevalidate) {
    revalidatePath(`/dashboard/members/${memberId}`)
    revalidatePath(`/dashboard/members/${memberId}/body`)
    revalidatePath('/dashboard/members')
    revalidatePath('/dashboard/my')
    revalidatePath('/dashboard/lesson-status')
  }

  return {
    record: saved,
    migrationHint: persistResult.migrationHint,
  }
}

/** 수업현황 선수 타일 — 해당 수업일 기준 체중 기록 */
export async function recordLessonStatusWeight(
  memberId: string,
  lessonDate: string,
  weightKg: number,
): Promise<{ error?: string; migrationHint?: string }> {
  const result = await addMemberBodyRecord(memberId, weightKg, {
    recordedAt: lessonDate,
    skipDashboardRevalidate: true,
  })
  if (result.error) {
    return { error: result.error, migrationHint: result.migrationHint }
  }
  return {}
}

/** 수업현황 — 체중 비우기/0 입력 시 해당 수업일 기록 삭제 */
export async function clearLessonStatusWeight(
  memberId: string,
  lessonDate: string,
): Promise<{ deleted?: boolean; error?: string; migrationHint?: string }> {
  await requireRole(['admin', 'instructor'])

  const supabase = await memberBodyWriteClient()
  const { data: existing, error: lookupError } = await supabase
    .from('member_body_records')
    .select('id')
    .eq('member_id', memberId)
    .eq('recorded_at', lessonDate)
    .maybeSingle()

  if (lookupError) {
    if (isMissingBodyRecordsTable(lookupError.message, lookupError.code)) {
      return {
        error: '신체 기록 테이블이 없습니다.',
        migrationHint: 'supabase/add-member-body-records.sql',
      }
    }
    return { error: lookupError.message }
  }

  if (!existing?.id) {
    return { deleted: false }
  }

  const { error } = await supabase
    .from('member_body_records')
    .delete()
    .eq('id', existing.id)
    .eq('member_id', memberId)

  if (error) {
    if (isMissingBodyRecordsTable(error.message, error.code)) {
      return {
        error: '신체 기록 테이블이 없습니다.',
        migrationHint: 'supabase/add-member-body-records.sql',
      }
    }
    return { error: error.message }
  }

  return { deleted: true }
}

function bodyWeightKey(memberId: string, date: string) {
  return `${memberId}:${date}`
}

export async function getMemberBodyWeightsForLessons(
  entries: { memberId: string; date: string }[],
): Promise<Record<string, number>> {
  await requireRole(['admin', 'instructor'])
  const uniqueMemberIds = [...new Set(entries.map((entry) => entry.memberId))]
  const uniqueDates = [...new Set(entries.map((entry) => entry.date))]
  if (uniqueMemberIds.length === 0 || uniqueDates.length === 0) return {}

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_body_records')
    .select('member_id, recorded_at, weight_kg')
    .in('member_id', uniqueMemberIds)
    .in('recorded_at', uniqueDates)

  if (error) {
    if (!isMissingBodyRecordsTable(error.message, error.code)) {
      console.error('getMemberBodyWeightsForLessons:', error)
    }
    return {}
  }

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[bodyWeightKey(row.member_id, row.recorded_at)] = Number(row.weight_kg)
  }
  return map
}

export async function getMemberBodyWeightsForDate(
  memberIds: string[],
  date: string,
): Promise<Record<string, number>> {
  await requireRole(['admin', 'instructor'])
  if (memberIds.length === 0) return {}

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_body_records')
    .select('member_id, weight_kg')
    .in('member_id', memberIds)
    .eq('recorded_at', date)

  if (error) {
    if (!isMissingBodyRecordsTable(error.message, error.code)) {
      console.error('getMemberBodyWeightsForDate:', error)
    }
    return {}
  }

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[row.member_id] = Number(row.weight_kg)
  }
  return map
}

export async function deleteMemberBodyRecord(
  recordId: string,
  memberId: string,
): Promise<{ error?: string }> {
  if (isBootstrapBodyRecord(recordId)) {
    return { error: '신체정보 초기 설정은 삭제할 수 없습니다.' }
  }

  const access = await canAddBodyRecordFor(memberId)
  if (!access) {
    return { error: '권한이 없습니다.' }
  }

  const supabase = await memberBodyWriteClient()
  const { error } = await supabase
    .from('member_body_records')
    .delete()
    .eq('id', recordId)
    .eq('member_id', memberId)

  if (error) {
    if (isMissingBodyRecordsTable(error.message, error.code)) {
      return { error: '신체 기록 테이블이 없습니다.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/lesson-status')

  return {}
}

