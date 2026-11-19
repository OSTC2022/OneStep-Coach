'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CARB_DISCLAIMER,
  CARB_HEIGHT_MAX_CM,
  CARB_HEIGHT_MIN_CM,
  CARB_INTENSITIES,
  CARB_MEAL_NOTE,
  CARB_MEAL_PLANS,
  CARB_RUN_TIMES,
  carbStorageKey,
  CARB_WEIGHT_MAX_KG,
  CARB_WEIGHT_MIN_KG,
  DEFAULT_CARB_SETTINGS,
  bmiReferenceLabel,
  calculateBmi,
  carbCoefficient,
  LONG_DISTANCE_BMI,
  longDistanceBmiStatus,
  carbGramRange,
  formatCarbHeight,
  formatCarbResultText,
  intensityLabel,
  mealPlanLabel,
  mealPortions,
  parseCarbHeight,
  proteinGramRange,
  runTimeLabel,
  settingsFromSearchParams,
  settingsToSearchParams,
  type CarbIntensityId,
  type CarbMealPlan,
  type CarbRunTime,
  type CarbSettings,
} from '@/lib/carb-calculator'
import { saveMemberProfileHeight } from '@/lib/actions/member-body-records'
import { cn } from '@/lib/utils'

type CarbCalculatorProps = {
  className?: string
  /** 포털 카드 안에 넣을 때 바깥 테두리를 생략 */
  embedded?: boolean
  /** 로그인 회원. 있으면 이 회원 키를 계산기에 넣고 변경분도 회원 기록에 저장 */
  memberId?: string | null
  profileHeightCm?: number | null
}

function readStoredSettings(memberId?: string | null): CarbSettings | null {
  try {
    const raw = localStorage.getItem(carbStorageKey(memberId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CarbSettings>
    const fromQuery = settingsFromSearchParams(
      new URLSearchParams({
        w: String(parsed.weightKg ?? ''),
        i: String(parsed.intensity ?? ''),
        diet: parsed.diet ? '1' : '0',
        ...(parsed.heightCm != null ? { h: String(parsed.heightCm) } : {}),
        run: String(parsed.runTime ?? ''),
        meals: String(parsed.meals ?? ''),
      }),
    )
    return fromQuery
  } catch {
    return null
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

const optionClass = (selected: boolean) =>
  cn(
    'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
    selected
      ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_16px_-8px] shadow-primary/70'
      : 'border-border/80 bg-black/40 text-foreground/90 hover:border-primary/35',
  )

export function CarbCalculator({
  className,
  embedded = false,
  memberId = null,
  profileHeightCm = null,
}: CarbCalculatorProps) {
  const [settings, setSettings] = useState<CarbSettings>(DEFAULT_CARB_SETTINGS)
  const [heightInput, setHeightInput] = useState('')
  const [ready, setReady] = useState(false)
  const savedHeightRef = useRef<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = settingsFromSearchParams(params)
    const next = { ...(fromUrl ?? readStoredSettings(memberId) ?? DEFAULT_CARB_SETTINGS) }
    const profileHeight =
      profileHeightCm != null ? parseCarbHeight(String(profileHeightCm)) : null
    if (!params.has('h') && profileHeight != null) {
      next.heightCm = profileHeight
    }
    savedHeightRef.current = next.heightCm
    setSettings(next)
    setHeightInput(next.heightCm != null ? formatCarbHeight(next.heightCm) : '')
    setReady(true)
  }, [memberId, profileHeightCm])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(carbStorageKey(memberId), JSON.stringify(settings))
    } catch {
      // 사생활 모드 등에서는 저장을 건너뛴다.
    }
  }, [ready, memberId, settings])

  useEffect(() => {
    if (!ready || !memberId || settings.heightCm == null) return
    if (savedHeightRef.current === settings.heightCm) return
    const height = settings.heightCm
    const timer = window.setTimeout(() => {
      void saveMemberProfileHeight(memberId, height).then((result) => {
        if (!result.error) savedHeightRef.current = height
      })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [ready, memberId, settings.heightCm])

  const coefficient = carbCoefficient(settings.intensity, settings.diet)
  const carbs = carbGramRange(settings.weightKg, settings.intensity, settings.diet)
  const protein = proteinGramRange(settings.weightKg)
  const portions = useMemo(
    () =>
      mealPortions(
        settings.weightKg,
        settings.intensity,
        settings.diet,
        settings.runTime,
        settings.meals,
      ),
    [settings],
  )
  const bmi =
    settings.heightCm != null ? calculateBmi(settings.weightKg, settings.heightCm) : null
  const heightInvalid = heightInput.trim() !== '' && parseCarbHeight(heightInput) == null

  function patch(partial: Partial<CarbSettings>) {
    setSettings((current) => ({ ...current, ...partial }))
  }

  function shareUrl() {
    const params = settingsToSearchParams(settings)
    return `${window.location.origin}/carb-calculator?${params.toString()}`
  }

  async function handleCopyResult() {
    try {
      await copyText(formatCarbResultText(settings))
      toast.success('결과를 복사했습니다.')
    } catch {
      toast.error('결과를 복사하지 못했습니다.')
    }
  }

  async function handleCopyLink() {
    try {
      await copyText(shareUrl())
      toast.success('공유 링크를 복사했습니다. 링크에 체중이 포함됩니다.')
    } catch {
      toast.error('공유 링크를 복사하지 못했습니다.')
    }
  }

  function handleSave() {
    try {
      localStorage.setItem(CARB_STORAGE_KEY, JSON.stringify(settings))
      toast.success('이 기기에 저장했습니다. 서버에는 저장되지 않습니다.')
    } catch {
      toast.error('이 기기 저장에 실패했습니다.')
    }
  }

  return (
    <section
      className={cn(
        'mx-auto w-full min-w-0 text-foreground',
        embedded
          ? 'max-w-none p-2 sm:p-3'
          : 'max-w-lg rounded-xl border border-primary/35 bg-zinc-950/90 p-4 shadow-[0_0_28px_-16px] shadow-primary/50 sm:p-6',
        className,
      )}
      aria-label="러닝 탄수화물 계산기"
    >
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary">
        ONE STEP TRAINING CENTER
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        러닝 탄수화물 계산기
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        체중과 운동 강도로 하루 탄수화물 시작 범위를 계산합니다.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="carb-height" className="text-sm font-medium text-foreground">
            키 (cm)
          </label>
          <input
            id="carb-height"
            inputMode="numeric"
            type="text"
            value={heightInput}
            placeholder="선택, 예: 170"
            onChange={(event) => {
              const cleaned = event.target.value.replace(/[^\d.]/g, '')
              const [whole, ...rest] = cleaned.split('.')
              const next =
                cleaned.includes('.')
                  ? `${whole.slice(0, 3)}.${rest.join('').slice(0, 1)}`
                  : whole.slice(0, 3)
              setHeightInput(next)
              patch({ heightCm: parseCarbHeight(next) })
            }}
            className="mt-2 h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25"
            aria-invalid={heightInvalid}
            aria-describedby="carb-height-hint"
          />
          <p id="carb-height-hint" className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {heightInvalid
              ? `키는 ${CARB_HEIGHT_MIN_CM}–${CARB_HEIGHT_MAX_CM}cm로 입력해 주세요.`
              : 'BMI 참고용입니다. 탄수화물 계산에는 사용하지 않습니다.'}
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="carb-weight" className="text-sm font-medium text-foreground">
              체중
            </label>
            <span className="text-right text-sm font-semibold tabular-nums text-primary">
              {settings.weightKg}kg
              {bmi != null ? (
                <span className="ml-2 font-medium">
                  BMI {bmi.toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {bmiReferenceLabel(bmi)}
                  </span>
                </span>
              ) : (
                <span className="ml-2 text-xs font-normal text-muted-foreground">BMI —</span>
              )}
            </span>
          </div>
          <input
            id="carb-weight"
            type="range"
            min={CARB_WEIGHT_MIN_KG}
            max={CARB_WEIGHT_MAX_KG}
            step={1}
            value={settings.weightKg}
            onChange={(event) => patch({ weightKg: Number(event.target.value) })}
            className="mt-2 h-11 w-full accent-primary"
            aria-valuemin={CARB_WEIGHT_MIN_KG}
            aria-valuemax={CARB_WEIGHT_MAX_KG}
            aria-valuenow={settings.weightKg}
            aria-valuetext={
              bmi != null
                ? `${settings.weightKg}킬로그램, BMI ${bmi.toFixed(1)}`
                : `${settings.weightKg}킬로그램`
            }
          />
          <p className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{CARB_WEIGHT_MIN_KG}kg</span>
            <span>{CARB_WEIGHT_MAX_KG}kg</span>
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            장거리 적합 BMI {LONG_DISTANCE_BMI.min}–{LONG_DISTANCE_BMI.max}
            {bmi != null
              ? longDistanceBmiStatus(bmi) === 'within'
                ? ' · 이 범위 안'
                : longDistanceBmiStatus(bmi) === 'below'
                  ? ' · 이 범위보다 낮음'
                  : ' · 이 범위보다 높음'
              : ''}
            <span className="block">건강 진단이 아닌 장거리 러닝 참고 범위입니다.</span>
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">운동 강도</legend>
          <div className="mt-2 grid gap-2">
            {CARB_INTENSITIES.map((item) => {
              const selected = settings.intensity === item.id
              return (
                <label
                  key={item.id}
                  className={optionClass(selected)}
                >
                  <input
                    type="radio"
                    name="carb-intensity"
                    value={item.id}
                    checked={selected}
                    onChange={() => patch({ intensity: item.id satisfies CarbIntensityId })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>{item.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <label className={optionClass(settings.diet)}>
          <input
            type="checkbox"
            checked={settings.diet}
            onChange={(event) => patch({ diet: event.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          다이어트 중이에요
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">러닝 시간대</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CARB_RUN_TIMES.map((item) => {
              const selected = settings.runTime === item.id
              return (
                <label
                  key={item.id}
                  className={cn(optionClass(selected), 'justify-center px-2')}
                >
                  <input
                    type="radio"
                    name="carb-run-time"
                    value={item.id}
                    checked={selected}
                    onChange={() => patch({ runTime: item.id satisfies CarbRunTime })}
                    className="h-4 w-4 accent-primary"
                  />
                  {item.label}
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">식사 횟수</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CARB_MEAL_PLANS.map((item) => {
              const selected = settings.meals === item.id
              return (
                <label
                  key={item.id}
                  className={cn(optionClass(selected), 'justify-center px-2')}
                >
                  <input
                    type="radio"
                    name="carb-meals"
                    value={item.id}
                    checked={selected}
                    onChange={() => patch({ meals: item.id satisfies CarbMealPlan })}
                    className="h-4 w-4 accent-primary"
                  />
                  {item.label}
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>

      <div
        className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-xs font-medium text-primary/80">적용 기준</p>
        <p className="mt-1 text-sm font-medium text-foreground">
          다이어트 중이에요: {settings.diet ? '켜짐' : '꺼짐'}
          <span className="mt-0.5 block font-normal text-muted-foreground">
            {settings.diet ? '다이어트 중 범위' : '일반 훈련 범위'} · {intensityLabel(settings.intensity)}
          </span>
        </p>
        <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-primary">
          {carbs.min}–{carbs.max}
          <span className="ml-1 text-sm font-medium text-primary/70">g/일</span>
        </p>
        <p className="mt-1 text-sm text-foreground/80">
          탄수화물 {coefficient.min}–{coefficient.max} g/kg/일
        </p>
        <p className="mt-1 text-sm text-foreground/80">
          단백질 참고 {protein.min}–{protein.max} g/일 (1.6–2.2 g/kg/일)
        </p>
        {bmi != null && settings.heightCm != null ? (
          <p className="mt-2 text-sm text-foreground/80">
            BMI {bmi.toFixed(1)} · {bmiReferenceLabel(bmi)} (참고, 계산에 미사용)
          </p>
        ) : null}

        <h3 className="mt-4 text-sm font-medium text-foreground">끼니별 탄수화물</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {runTimeLabel(settings.runTime)} 러닝 · {mealPlanLabel(settings.meals)}
        </p>
        <ul className="mt-2 space-y-1.5">
          {portions.map((slot) => (
            <li
              key={slot.id}
              className="flex items-baseline justify-between gap-3 text-sm text-foreground"
            >
              <span className="min-w-0">
                {slot.label}
                <span className="ml-1 text-xs text-primary/70">{slot.ratio}%</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {slot.minGrams}–{slot.maxGrams}g
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{CARB_MEAL_NOTE}</p>
        <p className="mt-3 text-xs leading-relaxed text-foreground/75">{CARB_DISCLAIMER}</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void handleCopyResult()}
          className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
        >
          결과 복사
        </button>
        <button
          type="button"
          onClick={() => void handleCopyLink()}
          className="min-h-11 rounded-lg border border-primary/35 bg-black/30 px-3 text-sm font-medium text-foreground hover:bg-primary/10"
        >
          공유 링크
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="min-h-11 rounded-lg border border-primary/35 bg-black/30 px-3 text-sm font-medium text-foreground hover:bg-primary/10"
        >
          설정 저장
        </button>
      </div>
    </section>
  )
}
