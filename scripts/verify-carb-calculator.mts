import assert from 'node:assert/strict'
import {
  carbGramRange,
  mealPortions,
  proteinGramRange,
  settingsFromSearchParams,
  settingsToSearchParams,
} from '../lib/carb-calculator.ts'

const normal = carbGramRange(74, 'steady', false)
assert.equal(normal.min, Math.round(74 * 4))
assert.equal(normal.max, Math.round(74 * 6))

const diet = carbGramRange(74, 'jog', true)
assert.equal(diet.min, Math.round(74 * 2))
assert.equal(diet.max, Math.round(74 * 3))

const hard = carbGramRange(80, 'hard', true)
assert.equal(hard.min, Math.round(80 * 4))
assert.equal(hard.max, Math.round(80 * 5))

const protein = proteinGramRange(74)
assert.equal(protein.min, Math.round(74 * 1.6))
assert.equal(protein.max, Math.round(74 * 2.2))

for (const dietOn of [false, true]) {
  for (const intensity of ['jog', 'steady', 'hard'] as const) {
    for (const run of ['morning', 'afternoon', 'evening'] as const) {
      for (const meals of ['3', 'snack'] as const) {
        const daily = carbGramRange(74, intensity, dietOn)
        const portions = mealPortions(74, intensity, dietOn, run, meals)
        const minSum = portions.reduce((sum, slot) => sum + slot.minGrams, 0)
        const maxSum = portions.reduce((sum, slot) => sum + slot.maxGrams, 0)
        assert.equal(minSum, daily.min, `${intensity} ${run} ${meals} min`)
        assert.equal(maxSum, daily.max, `${intensity} ${run} ${meals} max`)
      }
    }
  }
}

const params = settingsToSearchParams({
  weightKg: 74,
  intensity: 'hard',
  diet: true,
  heightCm: 170,
  runTime: 'morning',
  meals: 'snack',
})
assert.equal(params.get('diet'), '1')
assert.equal(params.get('h'), '170')
const restored = settingsFromSearchParams(params)
assert.equal(restored?.diet, true)
assert.equal(restored?.heightCm, 170)
assert.equal(restored?.intensity, 'hard')

console.log('carb calculator checks passed')
