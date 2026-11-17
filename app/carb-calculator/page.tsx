import type { Metadata } from 'next'
import { CarbCalculator } from '@/components/carb-calculator/carb-calculator'

export const metadata: Metadata = {
  title: '러닝 탄수화물 계산기',
  description: '원스텝 트레이닝센터 회원용 러닝 탄수화물 시작 범위 계산기',
}

export default function CarbCalculatorPage() {
  return (
    <main className="min-h-dvh bg-[#070d18] px-3 py-6 text-foreground sm:px-4 sm:py-10">
      <CarbCalculator />
    </main>
  )
}
