'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { calculateMemberBmi, formatBodyMetric } from '@/lib/member-utils'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { proteinIntakeBySlotFromRecord } from '@/lib/member-body-protein'
import { ProteinIntakePanel } from '@/components/members/protein-intake-panel'
import { buildProteinNutritionFields } from '@/lib/member-body-nutrition'
import {
  HYDRATION_STATUS_CHOICES,
  POST_WORKOUT_MEAL_CHOICES,
  SUPPLEMENT_ITEM_CHOICES,
  getDefaultSupplementConfig,
  getNutritionChoiceTone,
  getVisibleSupplementItems,
  type BodyNutritionInput,
  type SupplementId,
  type SupplementItemStatus,
  type SupplementStatusMap,
} from '@/lib/member-body-nutrition'
import {
  type MemberProteinSettings,
  type ProteinIntakeBySlot,
} from '@/lib/member-body-protein'
import {
  CONDITION_CHOICES,
  FATIGUE_CHOICES,
  MEAL_STATUS_CHOICES,
  MUSCLE_SORENESS_CHOICES,
  SLEEP_HOUR_CHOICES,
  parsePainLevel,
  type BodyWellnessInput,
} from '@/lib/member-body-wellness'
import { BodyMetricInput } from '@/components/ui/body-metric-input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Label } from '@/components/ui/label'
import { PainAreaInput } from '@/components/members/pain-area-input'
import { QuickChoiceButtons } from '@/components/ui/quick-choice-buttons'
import { cn } from '@/lib/utils'

export type MemberBodyRecordFormValues = {
  date: string
  height: string
  weight: string
  sleepHours: BodyWellnessInput['sleep_hours'] | ''
  condition: BodyWellnessInput['condition'] | ''
  fatigue: BodyWellnessInput['fatigue'] | ''
  muscleSoreness: BodyWellnessInput['muscle_soreness'] | ''
  painArea: BodyWellnessInput['pain_area'] | ''
  painLevel: string
  painAreaNote: string
  mealStatus: BodyWellnessInput['meal_status'] | ''
  proteinIntakeBySlot: ProteinIntakeBySlot
  postWorkoutMealStatus: BodyNutritionInput['post_workout_meal_status'] | ''
  hydrationStatus: BodyNutritionInput['hydration_status'] | ''
  supplementStatus: SupplementStatusMap
}

export function createEmptyBodyRecordFormValues(
  overrides?: Partial<MemberBodyRecordFormValues>,
): MemberBodyRecordFormValues {
  return {
    date: '',
    height: '',
    weight: '',
    sleepHours: '',
    condition: '',
    fatigue: '',
    muscleSoreness: '',
    painArea: '',
    painLevel: '',
    painAreaNote: '',
    mealStatus: '',
    proteinIntakeBySlot: {},
    postWorkoutMealStatus: '',
    hydrationStatus: '',
    supplementStatus: {},
    ...overrides,
  }
}

export function memberBodyRecordToFormValues(
  record: MemberBodyRecord,
): MemberBodyRecordFormValues {
  return createEmptyBodyRecordFormValues({
    date: record.recorded_at,
    height: record.height_cm != null ? formatBodyMetric(record.height_cm) : '',
    weight: formatBodyMetric(record.weight_kg),
    sleepHours: record.sleep_hours ?? '',
    condition: record.condition ?? '',
    fatigue: record.fatigue ?? '',
    muscleSoreness: record.muscle_soreness ?? '',
    painArea: record.pain_area ?? '',
    painLevel: record.pain_level != null ? String(record.pain_level) : '',
    painAreaNote: record.pain_area_note ?? '',
    mealStatus: record.meal_status ?? '',
    proteinIntakeBySlot: proteinIntakeBySlotFromRecord(record),
    postWorkoutMealStatus: record.post_workout_meal_status ?? '',
    hydrationStatus: record.hydration_status ?? '',
    supplementStatus: record.supplement_status ?? {},
  })
}

export function bodyRecordFormToWellnessInput(
  values: MemberBodyRecordFormValues,
): BodyWellnessInput {
  return {
    sleep_hours: values.sleepHours || null,
    condition: values.condition || null,
    fatigue: values.fatigue || null,
    muscle_soreness: values.muscleSoreness || null,
    pain_area: values.painArea || null,
    pain_level: parsePainLevel(values.painLevel),
    pain_area_note: values.painArea === 'other' ? values.painAreaNote.trim() || null : null,
    meal_status: values.mealStatus || null,
  }
}

export function bodyRecordFormToNutritionInput(
  values: MemberBodyRecordFormValues,
  options?: {
    weightKg?: number | null
    proteinSettings?: Partial<MemberProteinSettings>
  },
): BodyNutritionInput {
  const supplementStatus = Object.fromEntries(
    Object.entries(values.supplementStatus).filter(([, status]) => Boolean(status)),
  ) as SupplementStatusMap

  const weightKg = options?.weightKg ?? (values.weight ? Number(values.weight) : null)
  const protein = buildProteinNutritionFields(
    { protein_intake_by_slot: values.proteinIntakeBySlot },
    weightKg,
    options?.proteinSettings,
  )

  return {
    ...protein,
    post_workout_meal_status: values.postWorkoutMealStatus || null,
    hydration_status: values.hydrationStatus || null,
    supplement_status:
      Object.keys(supplementStatus).length > 0 ? supplementStatus : null,
  }
}

export function validateBasicBodyRecord(
  values: MemberBodyRecordFormValues,
): string | null {
  if (!values.date) return '날짜를 선택해주세요.'
  const height = values.height ? Number(values.height) : null
  if (!values.height || !Number.isFinite(height) || (height ?? 0) <= 0) {
    return '현재 키를 입력해주세요.'
  }
  const weight = Number(values.weight)
  if (!Number.isFinite(weight) || weight <= 0) return '몸무게를 입력해주세요.'
  return null
}

interface MemberBodyRecordFieldsProps {
  idPrefix: string
  values: MemberBodyRecordFormValues
  onChange: (values: MemberBodyRecordFormValues) => void
  proteinSettings?: Partial<MemberProteinSettings>
  disabled?: boolean
  onEnterSubmit?: () => void
}

export function MemberBodyRecordFields({
  idPrefix,
  values,
  onChange,
  proteinSettings,
  disabled = false,
  onEnterSubmit,
}: MemberBodyRecordFieldsProps) {
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [nutritionOpen, setNutritionOpen] = useState(false)
  const supplementConfig = useMemo(() => getDefaultSupplementConfig(), [])
  const visibleSupplements = useMemo(
    () => getVisibleSupplementItems(supplementConfig),
    [supplementConfig],
  )

  const previewBmi = useMemo(() => {
    const height = values.height ? Number(values.height) : null
    const weight = values.weight ? Number(values.weight) : null
    return calculateMemberBmi(height, weight)
  }, [values.height, values.weight])

  const weightKg = useMemo(() => {
    const parsed = values.weight ? Number(values.weight) : null
    return parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }, [values.weight])

  function patch(partial: Partial<MemberBodyRecordFormValues>) {
    onChange({ ...values, ...partial })
  }

  function patchSupplement(id: SupplementId, status: SupplementItemStatus | '') {
    const next = { ...values.supplementStatus }
    if (!status) {
      delete next[id]
    } else {
      next[id] = status
    }
    patch({ supplementStatus: next })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`} className="text-xs text-foreground">
          날짜
        </Label>
        <KoreanDatePicker
          id={`${idPrefix}-date`}
          value={values.date}
          onChange={(date) => patch({ date })}
          placeholder="날짜 선택"
          compact
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-height`} className="text-xs text-foreground">
            현재 키 (cm)
          </Label>
          <BodyMetricInput
            id={`${idPrefix}-height`}
            placeholder="170"
            value={values.height}
            onChange={(height) => patch({ height })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-weight`} className="text-xs text-foreground">
            몸무게 (kg)
          </Label>
          <BodyMetricInput
            id={`${idPrefix}-weight`}
            placeholder="65"
            value={values.weight}
            onChange={(weight) => patch({ weight })}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnterSubmit?.()
            }}
          />
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-foreground/80">BMI (미리보기)</span>
        <span className="font-medium tabular-nums text-primary">
          {previewBmi != null ? previewBmi.toFixed(1) : '-'}
        </span>
      </div>

      <div className="rounded-lg border border-border/70">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-foreground"
          onClick={() => setOptionalOpen((open) => !open)}
        >
          <span>추가 입력 (선택)</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', optionalOpen && 'rotate-180')}
          />
        </button>
        {optionalOpen ? (
          <div className="space-y-3 border-t border-border/60 px-3 py-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">수면 시간</p>
              <QuickChoiceButtons
                value={values.sleepHours ?? ''}
                options={SLEEP_HOUR_CHOICES}
                toneCategory="sleep_hours"
                onChange={(sleepHours) => patch({ sleepHours })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">오늘 컨디션</p>
              <QuickChoiceButtons
                value={values.condition ?? ''}
                options={CONDITION_CHOICES}
                toneCategory="condition"
                onChange={(condition) => patch({ condition })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">피로도</p>
              <QuickChoiceButtons
                value={values.fatigue ?? ''}
                options={FATIGUE_CHOICES}
                toneCategory="fatigue"
                onChange={(fatigue) => patch({ fatigue })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">근육통</p>
              <QuickChoiceButtons
                value={values.muscleSoreness ?? ''}
                options={MUSCLE_SORENESS_CHOICES}
                toneCategory="muscle_soreness"
                onChange={(muscleSoreness) => patch({ muscleSoreness })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">통증 부위</p>
              <PainAreaInput
                painArea={values.painArea ?? ''}
                painLevel={values.painLevel}
                painAreaNote={values.painAreaNote}
                onChange={(next) => patch(next)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">식사 상태</p>
              <QuickChoiceButtons
                value={values.mealStatus ?? ''}
                options={MEAL_STATUS_CHOICES}
                toneCategory="meal_status"
                onChange={(mealStatus) => patch({ mealStatus })}
                disabled={disabled}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border/70">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-foreground"
          onClick={() => setNutritionOpen((open) => !open)}
        >
          <span>회복 &amp; 영양 체크</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', nutritionOpen && 'rotate-180')}
          />
        </button>
        {nutritionOpen ? (
          <div className="space-y-3 border-t border-border/60 px-3 py-3">
            <ProteinIntakePanel
              weightKg={weightKg}
              proteinIntakeBySlot={values.proteinIntakeBySlot}
              proteinSettings={proteinSettings}
              disabled={disabled}
              onIntakeBySlotChange={(proteinIntakeBySlot) =>
                patch({ proteinIntakeBySlot })
              }
            />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">운동 후 회복식</p>
              <QuickChoiceButtons
                value={values.postWorkoutMealStatus ?? ''}
                options={POST_WORKOUT_MEAL_CHOICES}
                getTone={(value) =>
                  getNutritionChoiceTone('post_workout_meal_status', value)
                }
                onChange={(postWorkoutMealStatus) => patch({ postWorkoutMealStatus })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">수분 섭취</p>
              <QuickChoiceButtons
                value={values.hydrationStatus ?? ''}
                options={HYDRATION_STATUS_CHOICES}
                getTone={(value) => getNutritionChoiceTone('hydration_status', value)}
                onChange={(hydrationStatus) => patch({ hydrationStatus })}
                disabled={disabled}
              />
            </div>

            {visibleSupplements.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground">영양제 / 보충제 체크</p>
                {visibleSupplements.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <p className="text-[11px] text-foreground/80">{item.label}</p>
                    <QuickChoiceButtons
                      value={values.supplementStatus[item.id] ?? ''}
                      options={SUPPLEMENT_ITEM_CHOICES}
                      getTone={(value) =>
                        getNutritionChoiceTone('supplement_item', value, {
                          required: item.required,
                        })
                      }
                      onChange={(status) => patchSupplement(item.id, status)}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-foreground/55">
              보충제는 식사를 대체하지 않습니다. 성장기 선수는 기본 식사, 수면, 회복이
              우선이며 필요한 항목은 보호자와 함께 확인해주세요.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
